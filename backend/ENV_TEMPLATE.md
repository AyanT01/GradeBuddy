# Backend Environment Variables

Copy these to a `.env` file in the `/backend` directory.

## Database Configuration

```bash
# Local development (Docker Compose PostgreSQL)
DATABASE_URL=postgresql+psycopg2://gradebuddy:gradebuddy@localhost:5432/gradebuddy

# Production (AWS Aurora) - Get from Terraform output
# DATABASE_URL=postgresql+psycopg2://gradebuddy_admin:YOUR_PASSWORD@your-cluster.cluster-xxx.us-east-1.rds.amazonaws.com:5432/gradebuddy

# Enable SSL for production database connections
DATABASE_SSL=false  # Set to 'true' for Aurora

# Environment
ENVIRONMENT=dev  # 'dev' or 'prod'

# Connection pool settings (optional, defaults shown)
DATABASE_POOL_SIZE=5
DATABASE_MAX_OVERFLOW=10
DATABASE_POOL_TIMEOUT=30

# Enable SQL query logging (optional)
SQL_ECHO=false
```

## AWS S3 Configuration

```bash
# Get these from Terraform output:
# terraform output -raw aws_access_key_id
# terraform output -raw aws_secret_access_key
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=ai-grading-app-uploads-xxxxxxxx
```

## Clerk Authentication

```bash
# From your Clerk Dashboard -> API Keys
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
```

## Example Complete .env

```bash
# Database
DATABASE_URL=postgresql+psycopg2://gradebuddy:gradebuddy@localhost:5432/gradebuddy
DATABASE_SSL=false
ENVIRONMENT=dev

# AWS
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
AWS_BUCKET_NAME=ai-grading-app-uploads-12345678

# Clerk
CLERK_ISSUER=https://your-instance.clerk.accounts.dev
```

## Getting Aurora Connection URL

After running `terraform apply`, get your database URL:

```bash
cd infra
terraform output -raw database_url
```

Then update your `.env`:

```bash
DATABASE_URL=postgresql+psycopg2://gradebuddy_admin:your_password@gradebuddy-dev.cluster-xxx.us-east-1.rds.amazonaws.com:5432/gradebuddy
DATABASE_SSL=true
ENVIRONMENT=prod
```
