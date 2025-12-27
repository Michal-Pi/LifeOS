# Firestore Backup Setup Guide

**Purpose:** Enable automated backups for disaster recovery
**Estimated Time:** 10 minutes
**Cost:** Free tier includes 1 backup/day, paid plans for more frequent backups

---

## Why Backups Are Important

Firestore backups protect against:

- **Accidental data deletion** - User or developer mistakes
- **Malicious data corruption** - Security incidents
- **Application bugs** - Code that corrupts data
- **Compliance requirements** - Data retention policies

---

## Option 1: Automated Daily Backups (Recommended)

### Step 1: Enable Backup Service

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **lifeos-pi**
3. Navigate to **Firestore Database**
4. Click on **Backups** tab in the left sidebar
5. Click **Set up backups**

### Step 2: Configure Backup Schedule

**Recommended Settings:**

- **Backup frequency:** Daily
- **Backup time:** Off-peak hours (e.g., 3:00 AM in your timezone)
- **Retention:** 7 days (free tier)
- **Location:** Same region as your database (us-central1)

**Configuration Example:**

```
Schedule: Daily at 03:00 (America/New_York)
Retention: 7 daily backups
Location: us-central1 (Iowa)
```

### Step 3: Enable Service Account Permissions

Firebase will prompt you to grant permissions:

1. Click **Enable** when prompted for backup service permissions
2. Confirm the service account can write to Cloud Storage

### Step 4: Verify Backup Setup

After 24-48 hours:

1. Return to **Firestore Database** → **Backups**
2. Verify you see completed backups listed
3. Check backup status shows "Successful"

---

## Option 2: Manual Backups (On-Demand)

### Using Firebase CLI

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Export Firestore data
firebase firestore:export gs://lifeos-pi.appspot.com/manual-backups/$(date +%Y%m%d)
```

### Using gcloud CLI

```bash
# Install gcloud if not already installed
# See: https://cloud.google.com/sdk/docs/install

# Set project
gcloud config set project lifeos-pi

# Export Firestore
gcloud firestore export gs://lifeos-pi.appspot.com/manual-backups/$(date +%Y%m%d)
```

---

## Restoring from Backup

### Restore Entire Database

**⚠️ WARNING:** This will overwrite your current data!

```bash
# Using Firebase CLI
firebase firestore:import gs://lifeos-pi.appspot.com/backups/BACKUP_DATE

# Using gcloud CLI
gcloud firestore import gs://lifeos-pi.appspot.com/backups/BACKUP_DATE
```

### Restore Specific Collections

```bash
# Restore only specific collections
gcloud firestore import \
  gs://lifeos-pi.appspot.com/backups/BACKUP_DATE \
  --collection-ids users,quotes
```

### Restore to Different Project (Testing)

```bash
# Restore backup to a test project for verification
gcloud firestore import \
  gs://lifeos-pi.appspot.com/backups/BACKUP_DATE \
  --project lifeos-pi-test
```

---

## Backup Storage Costs

### Free Tier

- **1 backup per day** - Free
- **Storage:** First 5GB free
- **Retention:** 7 days

### Paid Tier

- **Multiple daily backups** - ~$0.15 per GB/month
- **Extended retention** - Same storage cost
- **Network egress** - $0.12 per GB (only when restoring)

### Estimated Monthly Cost (LifeOS)

Assuming ~500MB database size:

- **Daily backups (7 day retention):** $0.53/month
- **Twice-daily backups (30 day retention):** $2.25/month

**Recommendation:** Start with free daily backups, upgrade if needed

---

## Monitoring Backups

### Set Up Backup Alerts

1. Go to **Cloud Console** → **Monitoring** → **Alerting**
2. Create alert: "Backup job failed"
3. Configure notification email

### Check Backup Status

**Via Firebase Console:**

1. **Firestore Database** → **Backups**
2. View status of recent backups
3. Check "Last successful backup" timestamp

**Via gcloud:**

```bash
# List recent backup operations
gcloud firestore operations list \
  --filter="metadata.operationType=EXPORT_DOCUMENTS"
```

---

## Best Practices

### 1. Test Restores Regularly

- Restore to a test project monthly
- Verify data integrity
- Document restore procedure

### 2. Store Backups in Multiple Locations

```bash
# Copy backups to a secondary bucket
gsutil -m cp -r \
  gs://lifeos-pi.appspot.com/backups/BACKUP_DATE \
  gs://lifeos-pi-dr-backups/BACKUP_DATE
```

### 3. Document Critical Collections

Keep a list of critical collections that MUST be backed up:

- `users/*` - User data
- `users/{userId}/calendarEvents` - Calendar events
- `users/{userId}/projects` - Projects and todos
- `users/{userId}/topics` - Notes
- `quotes/*` - Daily quotes

### 4. Set Up Monitoring

- Email alerts for backup failures
- Weekly review of backup logs
- Monthly test restore

---

## Quick Reference Commands

```bash
# Start automated daily backup
# (Done via Firebase Console UI, see Option 1 above)

# Manual export (on-demand)
firebase firestore:export gs://lifeos-pi.appspot.com/manual-backups/$(date +%Y%m%d)

# List all backups
gsutil ls gs://lifeos-pi.appspot.com/backups/

# Restore from backup
firebase firestore:import gs://lifeos-pi.appspot.com/backups/BACKUP_DATE

# Copy backup to secondary location
gsutil -m cp -r gs://lifeos-pi.appspot.com/backups/LATEST gs://lifeos-backup/

# Check backup size
gsutil du -sh gs://lifeos-pi.appspot.com/backups/LATEST
```

---

## Troubleshooting

### Backup Fails with "Permission Denied"

**Solution:** Enable Firestore backup service account

```bash
gcloud projects add-iam-policy-binding lifeos-pi \
  --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com \
  --role=roles/datastore.importExportAdmin
```

### Backup Takes Too Long

**Cause:** Large database or slow network
**Solution:**

- Schedule during off-peak hours
- Consider incremental backups (Cloud Firestore native backups)

### Cannot Find Backup Files

**Check:**

1. Verify bucket exists: `gsutil ls gs://lifeos-pi.appspot.com/`
2. Check backup location in Firebase Console settings
3. Ensure backup completed successfully (check status)

---

## Next Steps

1. ✅ **Enable daily automated backups** (Firebase Console)
2. ⏰ **Set calendar reminder** to check backup status monthly
3. 📧 **Configure failure alerts** (Cloud Monitoring)
4. 🧪 **Schedule quarterly test restore** to verify backups work
5. 📝 **Document restore procedure** for your team

---

## Resources

- [Official Firestore Backup Guide](https://firebase.google.com/docs/firestore/backups)
- [gcloud firestore commands](https://cloud.google.com/sdk/gcloud/reference/firestore)
- [Backup pricing calculator](https://cloud.google.com/products/calculator)
- [Disaster recovery best practices](https://cloud.google.com/architecture/dr-scenarios-planning-guide)

---

**Status:** ⚠️ Not yet configured
**Priority:** High - Protects against data loss
**Action Required:** Enable automated daily backups in Firebase Console
