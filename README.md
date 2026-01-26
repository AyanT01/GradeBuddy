# GradeBuddy

An AI-powered grading platform that connects teachers and students. Teachers create classrooms and assignments, students join via codes and submit their work as PDFs, which are stored in AWS S3.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│                    Next.js 14+ (App Router)                         │
│                   TypeScript + Tailwind CSS                          │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Clerk Auth  │  │  Dashboard   │  │  Assignment/Classroom    │  │
│  │  (Sign in/up)│  │  (Role-based)│  │  Detail Pages            │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP + JWT
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           BACKEND                                    │
│                      FastAPI (Python)                                │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Auth        │  │  Classrooms  │  │  Assignments/Submissions │  │
│  │  (JWT verify)│  │  (CRUD)      │  │  (CRUD + Presigned URLs) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└──────────┬─────────────────┬────────────────────┬───────────────────┘
           │                 │                    │
           ▼                 ▼                    ▼
┌──────────────────┐  ┌─────────────┐    ┌───────────────┐
│    PostgreSQL    │  │   Clerk     │    │    AWS S3     │
│    (SQLModel)    │  │   (JWKS)    │    │   (Files)     │
└──────────────────┘  └─────────────┘    └───────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+, TypeScript, Tailwind CSS, Clerk |
| Backend | FastAPI, Python 3.11+, SQLModel, Pydantic |
| Database | PostgreSQL (Docker Compose local / Aurora Serverless v2 prod) |
| Auth | Clerk (frontend SDK + backend JWT validation) |
| Storage | AWS S3 (presigned URLs for direct uploads) |
| Infra | Terraform (S3 + Aurora PostgreSQL) |
| Deployment | Vercel (frontend) + Any Python host (backend) |

## How It Works

### 1. Authentication Flow

```
User → Clerk Sign-up/Sign-in → JWT Token → Backend validates via JWKS
```

1. User signs up/in via Clerk (frontend)
2. Clerk issues a JWT token
3. Frontend includes token in `Authorization: Bearer <token>` header
4. Backend fetches Clerk's public keys (JWKS) and validates the JWT
5. On first sync, user selects role (teacher/student) → stored in DB

### 2. Role-Based Access

**Teachers can:**
- Create classrooms (generates 6-digit join code)
- Create assignments (with description + PDF attachment)
- View all student submissions
- See analytics (student count, submission rates)

**Students can:**
- Join classrooms via code
- View assignments and download teacher materials
- Upload PDF submissions
- View their own submission history

### 3. File Upload Flow (Presigned URLs)

```
Frontend                    Backend                     S3
   │                           │                        │
   │ 1. Request presigned URL  │                        │
   │ ────────────────────────► │                        │
   │                           │ 2. Generate URL        │
   │                           │ ──────────────────────►│
   │ 3. Return presigned URL   │                        │
   │ ◄──────────────────────── │                        │
   │                           │                        │
   │ 4. PUT file directly to S3│                        │
   │ ─────────────────────────────────────────────────► │
   │                           │                        │
   │ 5. Confirm upload         │                        │
   │ ────────────────────────► │                        │
   │                           │ 6. Store file_key      │
   │                           │    in database         │
```

This approach:
- Keeps large files off the backend server
- Uploads go directly from browser → S3
- Backend only stores the S3 key reference

## Database Schema

```
┌─────────────┐       ┌─────────────────────┐       ┌──────────────┐
│    User     │       │ ClassroomMembership │       │  Classroom   │
├─────────────┤       ├─────────────────────┤       ├──────────────┤
│ id          │       │ id                  │       │ id           │
│ clerk_id    │◄──────│ student_id          │       │ name         │
│ email       │       │ classroom_id        │──────►│ join_code    │
│ role        │       └─────────────────────┘       │ teacher_id   │──┐
└─────────────┘                                     └──────────────┘  │
      │                                                    │          │
      │                                                    ▼          │
      │                                           ┌──────────────┐    │
      │                                           │  Assignment  │    │
      │                                           ├──────────────┤    │
      │                                           │ id           │    │
      │                                           │ title        │    │
      │                                           │ description  │    │
      │                                           │ file_key     │    │
      │                                           │ classroom_id │    │
      │                                           └──────────────┘    │
      │                                                    │          │
      │         ┌──────────────┐                          │          │
      │         │  Submission  │                          │          │
      │         ├──────────────┤                          │          │
      └────────►│ student_id   │                          │          │
                │ assignment_id│◄─────────────────────────┘          │
                │ file_key     │                                      │
                └──────────────┘              ◄────────────────────────┘
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/sync` | Sync user from Clerk, set/update role |

### Classrooms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/classrooms` | List user's classrooms |
| POST | `/classrooms` | Create classroom (teachers) |
| POST | `/classrooms/join` | Join via code (students) |

### Assignments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/classrooms/{id}/assignments` | List assignments in classroom |
| POST | `/assignments` | Create assignment (teachers) |
| GET | `/assignments/{id}` | Get assignment details |
| GET | `/assignments/{id}/submissions` | List submissions |

### Uploads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload/presigned-url` | Get S3 presigned URL |
| POST | `/upload/complete` | Confirm upload, create submission |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/teacher` | Teacher dashboard stats |

## Project Structure

```
GradeBuddy/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, all endpoints
│   │   ├── models.py        # SQLModel database models
│   │   ├── database.py      # DB connection, session management
│   │   └── auth.py          # Clerk JWT validation
│   ├── requirements.txt
│   ├── docker-compose.yml   # PostgreSQL for local dev
│   └── .env                 # Environment variables
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── layout.tsx            # Root layout + ClerkProvider
│   │   │   ├── sign-in/              # Clerk sign-in
│   │   │   ├── sign-up/              # Clerk sign-up
│   │   │   ├── onboarding/           # Role selection
│   │   │   └── dashboard/
│   │   │       ├── page.tsx          # Main dashboard
│   │   │       ├── classrooms/[id]/  # Classroom detail
│   │   │       └── assignments/[id]/ # Assignment detail
│   │   ├── components/
│   │   │   ├── RoleGate.tsx          # Role selection + routing
│   │   │   ├── TeacherPanel.tsx      # Teacher dashboard UI
│   │   │   ├── StudentPanel.tsx      # Student dashboard UI
│   │   │   ├── ClassroomDetail.tsx   # Classroom view
│   │   │   ├── AssignmentDetail.tsx  # Assignment view
│   │   │   └── UploadPanel.tsx       # File upload component
│   │   ├── lib/
│   │   │   └── api.ts                # API fetch wrapper
│   │   └── middleware.ts             # Route protection
│   └── .env.local            # Clerk keys, API URL
│
└── infra/
    ├── main.tf               # Terraform S3 bucket config
    └── terraform.tfvars      # AWS region, bucket settings
```

## Getting Started

### Prerequisites
- Node.js 20.9+
- Python 3.11+
- Docker (for PostgreSQL)
- AWS account (for S3)
- Clerk account (for auth)

### 1. Clone and Setup Backend

```bash
cd backend

# Start PostgreSQL
docker compose up -d

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your values:
# - DATABASE_URL=postgresql://gradebuddy:gradebuddy@localhost:5432/gradebuddy
# - CLERK_ISSUER=https://your-app.clerk.accounts.dev
# - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME

# Run backend
uvicorn app.main:app --reload --port 8001
```

### 2. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
# Create .env.local with:
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
# CLERK_SECRET_KEY=sk_test_...
# NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001

# Run frontend
npm run dev
```

### 3. Configure Clerk

1. Go to Clerk Dashboard → Sessions → Customize session token
2. Add: `{"email": "{{user.primary_email_address}}"}`
3. Set redirect URLs:
   - After sign-in: `/dashboard`
   - After sign-up: `/onboarding`

### 4. Setup S3 (optional - for file uploads)

```bash
cd infra

# Configure terraform.tfvars
cp terraform.tfvars.example terraform.tfvars
# Edit with your AWS region

# Apply infrastructure
terraform init
terraform apply
```

Or manually create an S3 bucket with CORS configured for `localhost:3000` and `localhost:3001`.

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=postgresql://gradebuddy:gradebuddy@localhost:5432/gradebuddy
CLERK_ISSUER=https://your-app.clerk.accounts.dev
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

## User Flows

### Teacher Flow
1. Sign up → Select "I am a teacher" → Dashboard
2. Click "+" to create a classroom → Get join code
3. Open classroom → Click "+" to create assignment
4. Add title, description, attach PDF → Create
5. Share join code with students
6. View submissions on assignment detail page

### Student Flow
1. Sign up → Select "I am a student" → Dashboard
2. Enter 6-digit join code → Join classroom
3. Open classroom → Click an assignment
4. View instructions, download teacher's PDF
5. Upload your submission PDF
6. View your submission history

## Deployment

### 1. Provision AWS Infrastructure

```bash
cd infra

# Create terraform.tfvars
cp terraform.tfvars.example terraform.tfvars
# Edit with your values (especially db_master_password!)

# Deploy S3 + Aurora PostgreSQL
terraform init
terraform apply

# Get outputs for your .env files
terraform output bucket_name
terraform output -raw database_url
terraform output -raw aws_access_key_id
terraform output -raw aws_secret_access_key
```

**Aurora costs:** ~$43/month minimum when active (0.5 ACU). Scales to zero when idle in dev.

### 2. Deploy Backend

The FastAPI backend can be deployed to:
- **Railway** (recommended for simplicity)
- **AWS Lambda** (via Mangum adapter)
- **Render**
- **Any VPS** (DigitalOcean, EC2, etc.)

Required environment variables:
```
DATABASE_URL=postgresql+psycopg2://user:pass@aurora-endpoint:5432/gradebuddy
DATABASE_SSL=true
ENVIRONMENT=prod
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=...
```

### 3. Deploy Frontend to Vercel

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Set these environment variables in Vercel Dashboard:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Your production Clerk key |
| `CLERK_SECRET_KEY` | Your production Clerk secret |
| `NEXT_PUBLIC_API_BASE_URL` | Your deployed backend URL |

### 4. Update Clerk Settings

In Clerk Dashboard:
1. Add your Vercel URL to **Allowed redirect URLs**
2. Add your production domain

### 5. Update S3 CORS

Add your Vercel URL to S3 CORS origins:
```bash
cd infra
# Edit terraform.tfvars, add your Vercel URL to allowed_origins
terraform apply
```

Or manually via AWS Console/CLI.

## License

MIT
