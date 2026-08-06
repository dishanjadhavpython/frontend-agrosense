from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from soil_services.database import get_connection as open_connection
from soil_services.database import initialize_database
from soil_services.document_service import (
    answer_question,
    ensure_runtime_directories,
    get_document,
    list_documents,
    save_document,
)

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", BASE_DIR / "database.db"))
ALLOWED_ROLES = ("farmer", "seeker", "company", "admin")


def skill_similarity_tfidf(seeker_skills: str | None, required_skills: str | None) -> float:
    seeker_text = (seeker_skills or "").lower().replace(",", " ")
    required_text = (required_skills or "").lower().replace(",", " ")

    if seeker_text.strip() == "" or required_text.strip() == "":
        return 0.0

    vectorizer = TfidfVectorizer()
    tfidf = vectorizer.fit_transform([seeker_text, required_text])
    sim = cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0]
    return float(sim)


def compute_match_score(seeker, internship):
    score = 0
    reasons = []
    breakdown = {}

    similarity = skill_similarity_tfidf(seeker["skills"] or "", internship["required_skills"] or "")
    skill_score = round(similarity * 40, 2)
    score += skill_score
    breakdown["Skills Similarity (TF-IDF)"] = f"{skill_score}/40"
    reasons.append(f"Skill similarity (TF-IDF cosine): {round(similarity * 100, 1)}%")

    gpa_score = 5
    try:
        seeker_gpa = float(seeker["gpa"])
        min_gpa = float(internship["min_gpa"] or 0)
        if seeker_gpa >= min_gpa:
            gpa_score = 15
            reasons.append("Meets minimum GPA requirement")
        else:
            reasons.append("GPA slightly below requirement")
    except Exception:
        reasons.append("GPA check not available")

    score += gpa_score
    breakdown["GPA Score"] = f"{gpa_score}/15"

    marks_score = 4
    try:
        m10 = float(seeker["marks10"])
        m12 = float(seeker["marks12"])
        avg_marks = (m10 + m12) / 2
        if avg_marks >= 80:
            marks_score = 10
            reasons.append("Strong academic performance (10th/12th)")
        elif avg_marks >= 60:
            marks_score = 7
            reasons.append("Good academic performance (10th/12th)")
        else:
            reasons.append("Average academic performance (10th/12th)")
    except Exception:
        reasons.append("Academic marks not available")

    score += marks_score
    breakdown["10th/12th Marks"] = f"{marks_score}/10"

    mode_score = 4
    if (seeker["preferred_mode"] or "").lower() == (internship["mode"] or "").lower():
        mode_score = 10
        reasons.append("Internship mode preference matched")
    else:
        reasons.append("Mode preference not matched")

    score += mode_score
    breakdown["Mode Match"] = f"{mode_score}/10"

    loc_score = 4
    if (seeker["preferred_location"] or "").strip().lower() in (internship["location"] or "").strip().lower():
        loc_score = 10
        reasons.append("Preferred location matched")
    else:
        reasons.append("Location preference not matched")

    score += loc_score
    breakdown["Location Match"] = f"{loc_score}/10"

    sector_score = 4
    if (seeker["sector_interest"] or "").lower() == (internship["sector"] or "").lower():
        sector_score = 10
        reasons.append("Sector interest matched")
    else:
        reasons.append("Sector interest not matched")

    score += sector_score
    breakdown["Sector Match"] = f"{sector_score}/10"

    lor_score = 0
    if (seeker["lor_available"] or "") == "yes":
        lor_score = 3
        score += lor_score
        reasons.append("LOR available bonus applied")

    breakdown["LOR Bonus"] = f"+{lor_score}/3"

    rural_score = 0
    aspirational_score = 0
    caste_score = 0

    if (seeker["rural_urban"] or "").lower() == "rural":
        rural_score = 3
        score += rural_score
        reasons.append("Rural inclusion bonus applied")

    if (seeker["aspirational_district"] or "") == "yes":
        aspirational_score = 2
        score += aspirational_score
        reasons.append("Aspirational district bonus applied")

    if (seeker["caste_category"] or "") in ["SC", "ST"]:
        caste_score = 2
        score += caste_score
        reasons.append("Category representation bonus applied")

    breakdown["Rural Bonus"] = f"+{rural_score}/3"
    breakdown["Aspirational Bonus"] = f"+{aspirational_score}/2"
    breakdown["Category Bonus"] = f"+{caste_score}/2"

    return round(min(score, 100), 2), reasons, breakdown


application = Flask(__name__)
application.secret_key = os.getenv("SECRET_KEY", "soil-intelligence-secret")
application.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_UPLOAD_BYTES", 16 * 1024 * 1024))

initialize_database(DATABASE_PATH)
ensure_runtime_directories()


def get_connection():
    return open_connection(DATABASE_PATH)


def _redirect_for_role(role: str):
    if role == "farmer":
        return redirect(url_for("soil_dashboard"))
    if role == "seeker":
        return redirect(url_for("seeker_dashboard"))
    if role == "company":
        return redirect(url_for("company_dashboard"))
    return redirect(url_for("admin_dashboard"))


def _current_farmer_id() -> int | None:
    if session.get("role") == "farmer" and "user_id" in session:
        return int(session["user_id"])
    return None


@application.route("/")
def home():
    if "user_id" in session and session.get("role") in ALLOWED_ROLES:
        return _redirect_for_role(session["role"])
    return redirect(url_for("login"))


@application.route("/legacy")
def legacy_home():
    return render_template("index.html")


@application.route("/signup", methods=["GET", "POST"])
def signup():
    error = None
    selected_role = request.form.get("role", "farmer")

    if request.method == "POST":
        role = request.form.get("role", "farmer").strip().lower()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if role not in ALLOWED_ROLES:
            error = "Select a valid account type."
        elif not email:
            error = "Email is required."
        elif len(password) < 8:
            error = "Password must contain at least 8 characters."
        else:
            hashed = generate_password_hash(password)
            conn = None
            try:
                conn = get_connection()
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO users (role, email, password) VALUES (?, ?, ?)",
                    (role, email, hashed),
                )
                conn.commit()
                return redirect(url_for("login", role=role))
            except Exception:
                error = "An account already exists for this email."
            finally:
                if conn is not None:
                    conn.close()

        selected_role = role

    return render_template("signup.html", error=error, selected_role=selected_role)


@application.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET" and "user_id" in session and session.get("role") in ALLOWED_ROLES:
        return _redirect_for_role(session["role"])

    error = None
    selected_role = request.values.get("role", "farmer")

    if request.method == "POST":
        role = request.form.get("role", "farmer").strip().lower()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE email=? AND role=?", (email, role))
        user = cur.fetchone()
        conn.close()

        if user and check_password_hash(user["password"], password):
            session["user_id"] = user["id"]
            session["role"] = user["role"]
            session["email"] = user["email"]
            return _redirect_for_role(role)
        error = "Invalid login credentials."
        selected_role = role

    return render_template("login.html", error=error, selected_role=selected_role)


@application.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


@application.route("/dashboard")
@application.route("/soil/dashboard")
def soil_dashboard():
    if "user_id" not in session or session.get("role") != "farmer":
        return redirect(url_for("login", role="farmer"))
    return render_template("soil_dashboard.html", user_email=session.get("email", ""))


@application.route("/api/health")
@application.route("/health")
def healthcheck():
    return jsonify({"status": "ok"})


@application.route("/api/upload-pdf", methods=["POST"])
@application.route("/upload-pdf", methods=["POST"])
def upload_pdf():
    file = request.files.get("file")
    if file is None or not (file.filename or "").strip():
        return jsonify({"detail": "A PDF file is required."}), 400

    try:
        payload = save_document(file, owner_id=_current_farmer_id())
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400
    except Exception as exc:
        return jsonify({"detail": f"Failed to process PDF: {exc}"}), 500

    return jsonify(payload)


@application.route("/api/documents")
@application.route("/documents")
def documents():
    return jsonify({"documents": list_documents(owner_id=_current_farmer_id())})


@application.route("/api/documents/<path:document_id>")
@application.route("/documents/<path:document_id>")
def document_detail(document_id: str):
    try:
        payload = get_document(document_id, owner_id=_current_farmer_id())
    except FileNotFoundError:
        return jsonify({"detail": "Document not found."}), 404
    except PermissionError:
        return jsonify({"detail": "Document not accessible for this user."}), 403
    return jsonify(payload)


@application.route("/api/predictions/<path:document_id>")
def prediction_detail(document_id: str):
    try:
        payload = get_document(document_id, owner_id=_current_farmer_id())
    except FileNotFoundError:
        return jsonify({"detail": "Document not found."}), 404
    except PermissionError:
        return jsonify({"detail": "Document not accessible for this user."}), 403
    return jsonify(
        {
            "document_id": payload["id"],
            "filename": payload["filename"],
            "predictions": payload["predictions"],
        }
    )


@application.route("/api/ask-question", methods=["POST"])
@application.route("/ask-question", methods=["POST"])
def ask_question():
    payload = request.get_json(silent=True) or request.form.to_dict()
    question = str(payload.get("question") or "").strip()
    try:
        top_k = int(payload.get("top_k") or 5)
    except (TypeError, ValueError):
        return jsonify({"detail": "top_k must be a valid integer."}), 400
    document_selector = payload.get("document_id") or payload.get("filename")

    try:
        response = answer_question(
            question,
            top_k=top_k,
            document_selector=str(document_selector) if document_selector else None,
            owner_id=_current_farmer_id(),
        )
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400
    except FileNotFoundError:
        return jsonify({"detail": "Document not found."}), 404

    return jsonify(response)


@application.route("/seeker/dashboard")
def seeker_dashboard():
    if "user_id" not in session or session.get("role") != "seeker":
        return redirect(url_for("login", role="seeker"))

    user_id = session["user_id"]
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM seeker_profiles WHERE user_id=?", (user_id,))
    seeker = cur.fetchone()

    recommendations = []
    if seeker:
        cur.execute("SELECT * FROM internships WHERE status='active' AND seats > 0")
        internships = cur.fetchall()
        for internship in internships:
            score, reasons, breakdown = compute_match_score(seeker, internship)
            recommendations.append(
                {
                    "internship_id": internship["id"],
                    "role_title": internship["role_title"],
                    "company_name": internship["company_name"],
                    "sector": internship["sector"],
                    "mode": internship["mode"],
                    "location": internship["location"],
                    "seats": internship["seats"],
                    "score": score,
                    "reasons": reasons,
                    "breakdown": breakdown,
                }
            )
        recommendations.sort(key=lambda item: item["score"], reverse=True)

    cur.execute(
        """
        SELECT a.status, a.match_score, a.internship_id, i.role_title, i.company_name
        FROM applications a
        JOIN internships i ON a.internship_id = i.id
        WHERE a.seeker_user_id = ?
        ORDER BY a.id DESC
        """,
        (user_id,),
    )
    applications = cur.fetchall()
    conn.close()

    return render_template(
        "seeker_dashboard.html",
        seeker=seeker,
        recommendations=recommendations,
        applications=applications,
        has_profile=bool(seeker),
    )


@application.route("/company/dashboard")
def company_dashboard():
    if "user_id" not in session or session.get("role") != "company":
        return redirect(url_for("login", role="company"))

    company_user_id = session["user_id"]
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT * FROM internships
        WHERE company_user_id = ?
        ORDER BY id DESC
        """,
        (company_user_id,),
    )
    internships = cur.fetchall()

    internships_with_status = []
    for internship in internships:
        cur.execute(
            """
            SELECT a.seeker_user_id, a.status
            FROM applications a
            WHERE a.internship_id=?
            ORDER BY a.id DESC
            LIMIT 1
            """,
            (internship["id"],),
        )
        internships_with_status.append(
            {
                "internship": internship,
                "application": cur.fetchone(),
            }
        )

    conn.close()
    return render_template("company_dashboard.html", internships=internships_with_status)


@application.route("/admin/dashboard")
def admin_dashboard():
    if "user_id" not in session or session.get("role") != "admin":
        return redirect(url_for("login", role="admin"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, company_name, role_title, sector, mode, location, seats, status
        FROM internships
        ORDER BY id DESC
        """
    )
    internships = cur.fetchall()

    cur.execute("SELECT COUNT(*) FROM applications WHERE status='pending'")
    pending_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM applications WHERE status='allocated'")
    allocated_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM applications WHERE status='successful'")
    successful_count = cur.fetchone()[0]
    cur.execute(
        """
        SELECT COUNT(*)
        FROM applications a
        JOIN seeker_profiles s ON a.seeker_user_id = s.user_id
        WHERE a.status IN ('allocated','successful') AND lower(s.rural_urban)='rural'
        """
    )
    rural_allocated = cur.fetchone()[0]
    cur.execute(
        """
        SELECT COUNT(*)
        FROM applications a
        JOIN seeker_profiles s ON a.seeker_user_id = s.user_id
        WHERE a.status IN ('allocated','successful') AND s.aspirational_district='yes'
        """
    )
    aspirational_allocated = cur.fetchone()[0]
    conn.close()

    return render_template(
        "admin_dashboard.html",
        internships=internships,
        pending_count=pending_count,
        allocated_count=allocated_count,
        successful_count=successful_count,
        rural_allocated=rural_allocated,
        aspirational_allocated=aspirational_allocated,
    )


@application.route("/seeker/profile", methods=["POST"])
def save_seeker_profile():
    if "user_id" not in session or session.get("role") != "seeker":
        return redirect(url_for("login", role="seeker"))

    user_id = session["user_id"]
    name = request.form.get("name")
    phone = request.form.get("phone")
    age = request.form.get("age")
    marks10 = request.form.get("marks10")
    marks12 = request.form.get("marks12")
    gpa = request.form.get("gpa")
    qualification = request.form.get("qualification")
    degree = request.form.get("degree")
    branch = request.form.get("branch")
    college_name = request.form.get("college_name")
    college_type = request.form.get("college_type")
    skills = request.form.get("skills")
    experience_level = request.form.get("experience_level")
    sector_interest = request.form.get("sector_interest")
    preferred_mode = request.form.get("preferred_mode")
    preferred_location = request.form.get("preferred_location")
    caste_category = request.form.get("caste_category")
    rural_urban = request.form.get("rural_urban")
    aspirational_district = request.form.get("aspirational_district")
    lor_available = request.form.get("lor_available")
    first_time_intern = request.form.get("first_time_intern")
    pwd = request.form.get("pwd")
    income_bracket = request.form.get("income_bracket")
    employed_fulltime = request.form.get("employed_fulltime")
    student_fulltime = request.form.get("student_fulltime")
    distance_online_student = request.form.get("distance_online_student")

    try:
        age_int = int(age)
        if age_int < 21 or age_int > 24:
            return "Age must be between 21 and 24"
    except Exception:
        return "Invalid age"

    if degree in ["M.Tech", "M.Sc", "MBA", "MCA"]:
        return "Masters students are not allowed as per scheme"

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO seeker_profiles (
            user_id, name, phone, age, marks10, marks12, gpa, qualification, degree, branch,
            college_name, college_type, skills, experience_level, sector_interest,
            preferred_mode, preferred_location, caste_category, rural_urban, aspirational_district,
            lor_available, first_time_intern, pwd, income_bracket,
            employed_fulltime, student_fulltime, distance_online_student
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            name=excluded.name,
            phone=excluded.phone,
            age=excluded.age,
            marks10=excluded.marks10,
            marks12=excluded.marks12,
            gpa=excluded.gpa,
            qualification=excluded.qualification,
            degree=excluded.degree,
            branch=excluded.branch,
            college_name=excluded.college_name,
            college_type=excluded.college_type,
            skills=excluded.skills,
            experience_level=excluded.experience_level,
            sector_interest=excluded.sector_interest,
            preferred_mode=excluded.preferred_mode,
            preferred_location=excluded.preferred_location,
            caste_category=excluded.caste_category,
            rural_urban=excluded.rural_urban,
            aspirational_district=excluded.aspirational_district,
            lor_available=excluded.lor_available,
            first_time_intern=excluded.first_time_intern,
            pwd=excluded.pwd,
            income_bracket=excluded.income_bracket,
            employed_fulltime=excluded.employed_fulltime,
            student_fulltime=excluded.student_fulltime,
            distance_online_student=excluded.distance_online_student
        """,
        (
            user_id,
            name,
            phone,
            age,
            marks10,
            marks12,
            gpa,
            qualification,
            degree,
            branch,
            college_name,
            college_type,
            skills,
            experience_level,
            sector_interest,
            preferred_mode,
            preferred_location,
            caste_category,
            rural_urban,
            aspirational_district,
            lor_available,
            first_time_intern,
            pwd,
            income_bracket,
            employed_fulltime,
            student_fulltime,
            distance_online_student,
        ),
    )
    conn.commit()
    conn.close()
    return redirect(url_for("seeker_dashboard"))


@application.route("/company/post", methods=["POST"])
def company_post_internship():
    if "user_id" not in session or session.get("role") != "company":
        return redirect(url_for("login", role="company"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO internships
        (company_user_id, company_name, role_title, sector, required_skills, seats, stipend, mode, location, min_gpa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session["user_id"],
            request.form.get("company_name") or session.get("email", "Company"),
            request.form.get("role"),
            request.form.get("sector"),
            request.form.get("skills"),
            request.form.get("seats"),
            request.form.get("stipend"),
            request.form.get("mode"),
            request.form.get("location"),
            request.form.get("min_gpa"),
        ),
    )
    conn.commit()
    conn.close()
    return redirect(url_for("company_dashboard"))


@application.route("/seeker/apply", methods=["POST"])
def seeker_apply():
    if "user_id" not in session or session.get("role") != "seeker":
        return redirect(url_for("login", role="seeker"))

    seeker_user_id = session["user_id"]
    internship_id = request.form.get("internship_id")
    match_score = request.form.get("match_score")
    match_reason = request.form.get("match_reason")

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM applications WHERE seeker_user_id=? AND internship_id=?",
        (seeker_user_id, internship_id),
    )
    existing = cur.fetchone()
    if existing:
        conn.close()
        return "You already applied for this internship."

    cur.execute(
        """
        INSERT INTO applications (seeker_user_id, internship_id, match_score, match_reason, status)
        VALUES (?, ?, ?, ?, 'pending')
        """,
        (seeker_user_id, internship_id, match_score, match_reason),
    )
    conn.commit()
    conn.close()
    return redirect(url_for("seeker_dashboard"))


@application.route("/admin/internship/<int:internship_id>/matches")
def admin_view_matches(internship_id: int):
    if "user_id" not in session or session.get("role") != "admin":
        return redirect(url_for("login", role="admin"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM internships WHERE id=?", (internship_id,))
    internship = cur.fetchone()
    if not internship:
        conn.close()
        return "Internship not found"

    cur.execute(
        """
        SELECT s.*
        FROM applications a
        JOIN seeker_profiles s ON a.seeker_user_id = s.user_id
        WHERE a.internship_id = ? AND a.status = 'pending'
        """,
        (internship_id,),
    )
    seekers = cur.fetchall()

    ranked = []
    for seeker in seekers:
        try:
            age = int(seeker["age"])
            if age < 21 or age > 24:
                continue
        except Exception:
            continue

        if seeker["employed_fulltime"] == "yes" or seeker["student_fulltime"] == "yes":
            continue

        score, reasons, breakdown = compute_match_score(seeker, internship)
        ranked.append(
            {
                "user_id": seeker["user_id"],
                "name": seeker["name"],
                "skills": seeker["skills"],
                "score": score,
                "reasons": reasons,
                "breakdown": breakdown,
            }
        )

    ranked.sort(key=lambda item: item["score"], reverse=True)
    conn.close()
    return render_template("admin_matches.html", internship=internship, ranked=ranked)


@application.route("/admin/approve", methods=["POST"])
def admin_approve_allocation():
    if "user_id" not in session or session.get("role") != "admin":
        return redirect(url_for("login", role="admin"))

    internship_id = int(request.form.get("internship_id"))
    seeker_user_id = int(request.form.get("seeker_user_id"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("BEGIN IMMEDIATE")
    cur.execute("SELECT seats FROM internships WHERE id=?", (internship_id,))
    internship = cur.fetchone()

    if not internship or internship["seats"] <= 0:
        conn.rollback()
        conn.close()
        return "No seats available."

    cur.execute(
        "SELECT * FROM applications WHERE seeker_user_id=? AND internship_id=?",
        (seeker_user_id, internship_id),
    )
    existing = cur.fetchone()

    if existing:
        cur.execute(
            """
            UPDATE applications
            SET status='allocated'
            WHERE seeker_user_id=? AND internship_id=?
            """,
            (seeker_user_id, internship_id),
        )
    else:
        cur.execute(
            """
            INSERT INTO applications (seeker_user_id, internship_id, match_score, match_reason, status)
            VALUES (?, ?, 0, 'Allocated by Admin', 'allocated')
            """,
            (seeker_user_id, internship_id),
        )

    cur.execute(
        "UPDATE internships SET seats = seats - 1 WHERE id=? AND seats > 0",
        (internship_id,),
    )
    conn.commit()
    conn.close()
    return redirect(url_for("admin_dashboard"))


@application.route("/company/view_candidate/<int:internship_id>")
def company_view_candidate(internship_id: int):
    if "user_id" not in session or session.get("role") != "company":
        return redirect(url_for("login", role="company"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM internships WHERE id=? AND company_user_id=?",
        (internship_id, session["user_id"]),
    )
    internship = cur.fetchone()
    if not internship:
        conn.close()
        return "Internship not found for this company."

    cur.execute(
        """
        SELECT seeker_user_id
        FROM applications
        WHERE internship_id=? AND status='allocated'
        LIMIT 1
        """,
        (internship_id,),
    )
    allocation = cur.fetchone()
    if not allocation:
        conn.close()
        return "No candidate allocated yet."

    cur.execute("SELECT * FROM seeker_profiles WHERE user_id=?", (allocation["seeker_user_id"],))
    seeker = cur.fetchone()
    conn.close()
    return render_template("company_view_candidate.html", internship=internship, seeker=seeker)


@application.route("/company/give_offer", methods=["POST"])
def company_give_offer():
    if "user_id" not in session or session.get("role") != "company":
        return redirect(url_for("login", role="company"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE applications
        SET status='successful'
        WHERE internship_id=? AND seeker_user_id=?
        """,
        (request.form.get("internship_id"), request.form.get("seeker_user_id")),
    )
    conn.commit()
    conn.close()
    return redirect(url_for("company_dashboard"))


@application.route("/admin/view_seeker/<int:seeker_user_id>/internship/<int:internship_id>")
def admin_view_seeker_profile(seeker_user_id: int, internship_id: int):
    if "user_id" not in session or session.get("role") != "admin":
        return redirect(url_for("login", role="admin"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM seeker_profiles WHERE user_id=?", (seeker_user_id,))
    seeker = cur.fetchone()
    conn.close()
    return render_template("admin_view_profile.html", seeker=seeker, internship_id=internship_id)


@application.route("/seeker/accept_offer", methods=["POST"])
def seeker_accept_offer():
    if "user_id" not in session or session.get("role") != "seeker":
        return redirect(url_for("login", role="seeker"))

    seeker_user_id = session["user_id"]
    internship_id = int(request.form.get("internship_id"))

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM applications WHERE seeker_user_id=? AND status='accepted'",
        (seeker_user_id,),
    )
    already = cur.fetchone()
    if already:
        conn.close()
        return "You already accepted one offer. You cannot accept another."

    cur.execute(
        """
        UPDATE applications
        SET status='accepted'
        WHERE seeker_user_id=? AND internship_id=? AND status='successful'
        """,
        (seeker_user_id, internship_id),
    )
    cur.execute(
        """
        UPDATE applications
        SET status='rejected'
        WHERE seeker_user_id=? AND status='successful' AND internship_id != ?
        """,
        (seeker_user_id, internship_id),
    )
    conn.commit()
    conn.close()
    return redirect(url_for("seeker_dashboard"))


if __name__ == "__main__":
    application.run()
