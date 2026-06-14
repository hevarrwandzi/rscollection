# RSCollection Deployment Runbook

## Live architecture

```text
rscollection.online
  -> Caddy container (ports 80/443, automatic HTTPS)
  -> Node/Express app container
  -> Amazon RDS PostgreSQL
  -> Amazon S3 product-image bucket
```

## AWS inventory

- AWS profile: `my acc 2`
- AWS account: `798256686327`
- Region: `eu-north-1`
- EC2 instance: `i-07d8eea9998a024c9`
- EC2 security group: `sg-05983f45f877f8758`
- RDS identifier: `rscollection-postgres`
- RDS endpoint: `rscollection-postgres.ctwkcociutms.eu-north-1.rds.amazonaws.com`
- RDS security group: `sg-056b0d4b2a0f17313`
- S3 bucket: `rscollection-product-images-798256686327-eu-north-1`
- EC2 IAM role: `rscollection-ec2-s3-upload-role`
- EC2 instance profile: `rscollection-ec2-instance-profile`

## Production environment variables

The production `.env` file lives on the EC2 host under the deployed project directory.
Do not commit real secret values.

Required production values:

```env
ADMIN_TOKEN=<secret>
DB_HOST=rscollection-postgres.ctwkcociutms.eu-north-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=shop
DB_USER=postgres
DB_PASSWORD=<secret>
DB_SSL=true
AWS_REGION=eu-north-1
S3_BUCKET=rscollection-product-images-798256686327-eu-north-1
S3_PUBLIC_BASE_URL=https://rscollection-product-images-798256686327-eu-north-1.s3.eu-north-1.amazonaws.com/products
CADDY_SITE=rscollection.online, www.rscollection.online
```

The app uses the EC2 IAM role for S3 uploads. Do not add AWS access keys to `.env`.

## Deploy manually

From the EC2 project directory:

```bash
cd ~/pro/rscollection

git fetch origin main
git reset --hard origin/main

docker compose config --quiet
docker compose up -d --build
```

Verify:

```bash
docker compose ps
curl -fsS http://localhost/health
curl -fsS https://rscollection.online/health
curl -fsS https://rscollection.online/products | head
```

Expected health response contains:

```json
{"status":"ok","database":"connected"}
```

## Backup and restore

Create a backup from the current Compose database service:

```bash
./scripts/backup-db.sh
```

Verify the newest backup:

```bash
LATEST_BACKUP="$(command find backups -maxdepth 1 -type f -name 'shop-*.sql' -size +0c -printf '%T@ %p\n' | sort -n | tail -n 1 | cut -d' ' -f2-)"
echo "$LATEST_BACKUP"
wc -c "$LATEST_BACKUP"
grep -q -- '-- PostgreSQL database dump complete' "$LATEST_BACKUP" && echo "latest backup complete"
```

Before using a backup for migration, restore it into a temporary database and then drop the temporary database.

## RDS rollback

If the app cannot use RDS, switch production `.env` back to the local Compose database:

```env
DB_HOST=db
DB_SSL=false
```

Then restart the app:

```bash
docker compose up -d app
curl -fsS http://localhost/health
```

Do not delete the old Docker database volume until RDS has been stable long enough for the project owner to accept the migration.

## S3 uploads

Product image uploads go through:

```text
POST /admin/product-images
```

The app uploads objects to:

```text
s3://rscollection-product-images-798256686327-eu-north-1/products/
```

Returned image URLs currently use public S3 object URLs.

## Known limitation: CloudFront

The preferred production design is:

```text
private S3 bucket -> CloudFront Origin Access Control -> public product image URLs
```

CloudFront creation is currently blocked by AWS account verification:

```text
Your account must be verified before you can add new CloudFront resources.
```

Until the AWS account is verified, the fallback is public read access for `products/*` only.

After AWS verification:

1. Create CloudFront distribution with OAC.
2. Change the S3 bucket policy to allow reads only from CloudFront.
3. Re-enable full S3 public access blocking.
4. Set `S3_PUBLIC_BASE_URL` to the CloudFront `/products` URL.
5. Rebuild/restart the app and verify image uploads.

## Operational checks

Useful one-liners:

```bash
# RDS status
aws rds describe-db-instances \
  --profile 'my acc 2' \
  --region eu-north-1 \
  --db-instance-identifier rscollection-postgres \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address,Public:PubliclyAccessible,DeletionProtection:DeletionProtection}' \
  --output table

# S3 smoke object metadata
aws s3 ls s3://rscollection-product-images-798256686327-eu-north-1/products/ \
  --profile 'my acc 2'

# EC2 IAM instance profile
aws ec2 describe-iam-instance-profile-associations \
  --profile 'my acc 2' \
  --region eu-north-1 \
  --filters Name=instance-id,Values=i-07d8eea9998a024c9 \
  --output table
```
