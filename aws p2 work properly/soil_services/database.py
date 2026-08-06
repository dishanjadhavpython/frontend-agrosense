from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seeker_profiles (
    user_id INTEGER PRIMARY KEY,
    name TEXT,
    phone TEXT,
    age INTEGER,
    marks10 REAL,
    marks12 REAL,
    gpa REAL,
    qualification TEXT,
    degree TEXT,
    branch TEXT,
    college_name TEXT,
    college_type TEXT,
    skills TEXT,
    experience_level TEXT,
    sector_interest TEXT,
    preferred_mode TEXT,
    preferred_location TEXT,
    caste_category TEXT,
    rural_urban TEXT,
    aspirational_district TEXT,
    lor_available TEXT,
    first_time_intern TEXT,
    pwd TEXT,
    income_bracket TEXT,
    employed_fulltime TEXT,
    student_fulltime TEXT,
    distance_online_student TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS internships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_user_id INTEGER NOT NULL,
    company_name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    sector TEXT NOT NULL,
    required_skills TEXT NOT NULL,
    seats INTEGER NOT NULL DEFAULT 0,
    stipend TEXT,
    mode TEXT NOT NULL,
    location TEXT NOT NULL,
    min_gpa REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (company_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seeker_user_id INTEGER NOT NULL,
    internship_id INTEGER NOT NULL,
    match_score REAL DEFAULT 0,
    match_reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    UNIQUE(seeker_user_id, internship_id),
    FOREIGN KEY (seeker_user_id) REFERENCES users(id),
    FOREIGN KEY (internship_id) REFERENCES internships(id)
);
"""


def initialize_database(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(database_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_connection(database_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    return conn
