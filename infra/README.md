# GradeBuddy Infrastructure

This directory contains Terraform configurations for provisioning AWS infrastructure for the GradeBuddy AI Grading Platform.

## Resources Created

- **S3 Bucket**: For storing student assignment uploads
  - Server-side encryption (AES256)
  - CORS configured for frontend uploads
  - Lifecycle rules for automatic file expiration
  - Public access blocked

- **Aurora PostgreSQL Serverless v2**: Production database
  - Auto-scaling (0.5 to 2 ACUs by default)
  - SSL encrypted connections
  - Publicly accessible for Vercel serverless functions
  - ~$43/month minimum when active

- **IAM User**: Application-specific credentials for S3 access
  - Minimal permissions (least privilege)

## Prerequisites

1. **Terraform** >= 1.0.0
   ```bash
   # macOS
   brew install terraform
   
   # Or download from https://www.terraform.io/downloads
   ```

2. **AWS CLI** configured with admin credentials
   ```bash
   # Install AWS CLI
   brew install awscli
   
   # Configure credentials
   aws configure
   ```

## Usage

### 1. Initialize Terraform

```bash
cd infra
terraform init
```

### 2. Create Variables File

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific values
```

### 3. Preview Changes

```bash
terraform plan
```

### 4. Apply Infrastructure

```bash
terraform apply
```

Type `yes` when prompted to confirm.

### 5. Get Output Values

After applying, retrieve the important values:

```bash
# View all outputs
terraform output

# Get specific values (for .env file)
terraform output bucket_name
terraform output -raw aws_access_key_id
terraform output -raw aws_secret_access_key

# Aurora database connection
terraform output aurora_endpoint
terraform output -raw database_url
```

### 6. Configure Backend Environment

Add these to your backend `.env` file:

```bash
# S3
AWS_ACCESS_KEY_ID=$(terraform output -raw aws_access_key_id)
AWS_SECRET_ACCESS_KEY=$(terraform output -raw aws_secret_access_key)
AWS_REGION=$(terraform output -raw bucket_region)
AWS_BUCKET_NAME=$(terraform output -raw bucket_name)

# Database (Aurora)
DATABASE_URL=$(terraform output -raw database_url)
DATABASE_SSL=true
ENVIRONMENT=prod
```

## File Structure

```
infra/
├── main.tf                    # Main Terraform configuration
├── terraform.tfvars.example   # Example variables file
├── .gitignore                 # Git ignore for sensitive files
└── README.md                  # This file
```

## Environment-Specific Notes

### Development (Local)
- Use Docker Compose PostgreSQL
- Files expire after 30 days
- No Aurora costs

### Development (Cloud)
- Aurora Serverless v2 at 0.5 ACU minimum (~$43/month when active)
- Scales to zero when completely idle (eventually)
- SSL required for all connections

### Production
- Consider enabling S3 versioning
- Remove/extend lifecycle rules
- Increase Aurora max capacity
- Use IAM Roles instead of IAM User
- Enable CloudFront CDN
- Set up VPC peering for private Aurora access

## Aurora PostgreSQL Details

### Costs
- **Minimum**: 0.5 ACU = ~$43/month when active
- **Maximum (default)**: 2 ACU = ~$172/month at full scale
- Storage: $0.10/GB/month
- I/O: $0.20 per million requests

### Scaling
- Scales automatically based on load
- Scales down to minimum during low traffic
- Takes a few minutes to scale up from cold

### Connecting
```bash
# Test connection from local machine
psql "postgresql://gradebuddy_admin:YOUR_PASSWORD@YOUR_ENDPOINT:5432/gradebuddy?sslmode=require"
```

### Security
- Publicly accessible (required for Vercel serverless)
- Security group allows port 5432 from anywhere
- SSL required for all connections
- Consider IP whitelisting in production

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

⚠️ **Warning**: This will delete the S3 bucket and all files in it!

## Troubleshooting

### "Access Denied" errors
- Ensure AWS CLI is configured with admin credentials
- Check IAM permissions for your AWS user

### Bucket name already exists
- S3 bucket names are globally unique
- The random suffix should prevent this
- If issues persist, re-run `terraform apply`

### CORS errors in browser
- Verify `allowed_origins` includes your frontend URL
- Check browser console for specific CORS error details
