# Soil Intelligence Hub

This repository now contains a unified Flask application built from the two supplied projects:

- `aws p2`: login/signup plus legacy multi-role Flask screens
- `aws p3`: PDF upload, soil-metric extraction, local vector search, and extractive Q&A

The merged system makes the farmer flow the primary experience:

1. Login or sign up
2. Upload a soil health PDF
3. Extract soil constituents from the PDF
4. Generate crop, fertilizer, and soil-health recommendations
5. Ask questions over the uploaded report

Legacy internship routes from `aws p2` are still available for `seeker`, `company`, and `admin` roles.

## Unified architecture

```text
Flask app (app.py)
├── Auth + session routes
├── Farmer dashboard route
├── Soil JSON API routes
├── Legacy internship routes
└── Shared services (soil_services/)
    ├── database.py          SQLite bootstrap and connections
    ├── pdf_processor.py     PDF text extraction
    ├── soil_report.py       Structured soil constituent extraction
    ├── prediction_engine.py Crop/fertilizer/soil-health recommendation layer
    ├── chunking.py          Chunk creation for report retrieval
    ├── embeddings.py        Local deterministic embeddings
    ├── vector_store.py      Persistent local vector index
    ├── keyword_extractor.py Keyword extraction
    └── rag_pipeline.py      Extractive answer generation
```

## Project comparison

### Project A: `aws p2`

- Stack: Flask, SQLite, scikit-learn
- Purpose found in code: internship portal with role-based dashboards
- Strength reused in merge: auth/session flow and server-rendered Flask shell
- Conflict: no crop/fertilizer prediction model artifacts were present

### Project B: `aws p3`

- Stack: FastAPI, PyMuPDF, numpy, scikit-learn
- Purpose found in code: PDF soil-report extraction + local RAG
- Strength reused in merge: PDF processing, soil reading extraction, vector retrieval
- Conflict: separate backend/frontend split with no authentication

## Conflict report

- App framework conflict:
  - `aws p2` used Flask with templates.
  - `aws p3` used FastAPI plus a standalone static frontend.
  - Resolution: standardized on Flask for the merged full-stack app.

- Product-scope conflict:
  - `aws p2` repository contents do not contain crop/fertilizer prediction models.
  - Resolution: added a pluggable `prediction_engine.py` with a rule-based fallback layer so the merged UI works now and can later be swapped with trained models without changing routes.

- Routing conflict:
  - `aws p2` expected role dashboards after login.
  - `aws p3` exposed open upload endpoints.
  - Resolution: kept `/api/*` and direct endpoint aliases for compatibility, while making farmer login the main UI path.

- Data conflict:
  - `aws p2` used SQLite.
  - `aws p3` stored metadata in a local pickle vector store.
  - Resolution: kept SQLite for users and legacy roles, and retained the vector store for document retrieval to avoid losing `aws p3` behavior.

- Dependency conflict:
  - `aws p2` had only Flask dependencies.
  - `aws p3` required PyMuPDF and numpy.
  - Resolution: consolidated into one `requirements.txt`.

## Final folder structure

```text
app.py
requirements.txt
README.md
.env.example
soil_services/
  __init__.py
  chunking.py
  database.py
  document_service.py
  embeddings.py
  keyword_extractor.py
  pdf_processor.py
  prediction_engine.py
  rag_pipeline.py
  soil_report.py
  vector_store.py
templates/
  index.html                 legacy landing page
  login.html                 unified login page
  signup.html                unified signup page
  soil_dashboard.html        merged farmer dashboard
  admin_*.html               legacy admin pages
  company_*.html             legacy company pages
  seeker_dashboard.html      legacy seeker page
static/
  soil_portal.css
  soil_dashboard.js
  style.css                  legacy CSS
  script.js                  legacy JS
tests/
  test_prediction_engine.py
  test_soil_report.py
uploads/
data/
```

## Setup

1. Create a virtual environment.
2. Install dependencies.
3. Run the Flask app.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

The app bootstraps `database.db` automatically on first run.

## Run instructions

- Unified login: `http://127.0.0.1:5000/login`
- Farmer dashboard: `http://127.0.0.1:5000/dashboard`
- Legacy landing page: `http://127.0.0.1:5000/legacy`
- Health check: `http://127.0.0.1:5000/health`

## API routes

- `GET /api/health`
- `POST /api/upload-pdf`
- `GET /api/documents`
- `GET /api/documents/<document_id>`
- `GET /api/predictions/<document_id>`
- `POST /api/ask-question`

Endpoint aliases without `/api` are also preserved for backward compatibility with the original `aws p3` frontend behavior.

## Data model

### SQLite

- `users`
- `seeker_profiles`
- `internships`
- `applications`

### Local document persistence

- Uploaded PDFs: `uploads/`
- Vector index: `data/vector_store.pkl`

## Database migration plan

For production deployment, move these components off local disk:

1. Replace SQLite with PostgreSQL or Amazon RDS.
2. Replace local `uploads/` with S3 object storage.
3. Replace the pickle vector store with a managed vector database or PostgreSQL + pgvector.
4. Port the rule-based prediction layer behind the same interface to real trained model artifacts when they become available.

## Testing

Run the included smoke tests with:

```bash
python -m unittest discover -s tests
```

Recommended next coverage:

- unit tests for PDF parsing edge cases
- integration tests for upload and question-answer endpoints
- auth/session tests for farmer and legacy roles
- regression tests for legacy internship workflows
