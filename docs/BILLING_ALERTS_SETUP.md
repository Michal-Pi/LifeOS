# Firebase & GCP Billing Alerts Setup

**Purpose:** Monitor costs and prevent unexpected bills
**Estimated Time:** 15 minutes
**Cost:** Free (alerts are free, you only pay for resources)

---

## Why Billing Alerts Are Important

Protect against:

- **Unexpected cost spikes** - Traffic surges or runaway functions
- **Resource leaks** - Functions that don't scale down
- **Quota overruns** - Accidental high-volume usage
- **Budget overruns** - Stay within your monthly budget

---

## Current Project Setup

**Project:** lifeos-pi
**Current Configuration:**

- Cloud Functions: 14 functions @ 256MiB
- Firestore: Small-scale usage (~500MB estimated)
- Firebase Hosting: Static site hosting
- Cloud Storage: Attachments and backups

**Estimated Monthly Cost:**

- Free tier covers most usage for small-scale
- Functions: < $1/month (low traffic)
- Firestore: Free tier (< 50K reads/day)
- Hosting: Free (< 10GB/month transfer)
- **Total: ~$1-5/month**

---

## Step 1: Set Up Budget Alerts

### Using Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **lifeos-pi**
3. Navigate to **Billing** → **Budgets & alerts**
4. Click **Create Budget**

### Configure Budget

**Recommended Settings for Small Budget:**

```
Budget Name: LifeOS Monthly Budget
Projects: lifeos-pi
Products: All products (or select specific ones)
Time Range: Monthly (recurring)
Budget Amount: $10.00 USD/month
```

**Alert Thresholds:**

- 50% of budget ($5) - Warning email
- 90% of budget ($9) - Urgent email
- 100% of budget ($10) - Critical email + action

### Configure Alert Actions

**Email Notifications:**

- Add your email address
- Add team members if applicable
- Enable "Include cost forecast in email"

**Programmatic Notifications (Optional):**

- Connect to Pub/Sub topic for automation
- Trigger Cloud Function to disable resources
- Send Slack/Discord notification

---

## Step 2: Set Up Firebase Budget Alerts

Firebase has its own billing page with usage graphs.

### Using Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **lifeos-pi**
3. Click **Settings** (gear icon) → **Usage and billing**
4. Click **Details & settings** → **Usage & billing**
5. Click **Modify plan** to see current usage

### Monitor Key Metrics

**Firestore:**

- Document reads: 50,000/day free
- Document writes: 20,000/day free
- Storage: 1 GB free

**Cloud Functions:**

- Invocations: 2M/month free
- GB-seconds: 400,000/month free
- Networking: 5GB egress/month free

**Hosting:**

- Storage: 10 GB free
- Data transfer: 360 MB/day free

---

## Step 3: Set Up Per-Service Budgets

For finer-grained control, create separate budgets for each service.

### Cloud Functions Budget

```
Budget Name: Cloud Functions Budget
Products: Cloud Functions
Time Range: Monthly
Amount: $5.00 USD/month
Alerts: 50%, 90%, 100%
```

### Firestore Budget

```
Budget Name: Firestore Budget
Products: Cloud Firestore
Time Range: Monthly
Amount: $2.00 USD/month
Alerts: 50%, 90%, 100%
```

### Cloud Storage Budget

```
Budget Name: Cloud Storage Budget
Products: Cloud Storage
Time Range: Monthly
Amount: $1.00 USD/month
Alerts: 50%, 90%, 100%
```

---

## Step 4: Configure Automatic Actions

### Option 1: Disable Billing (Nuclear Option)

**⚠️ WARNING:** This will shut down ALL services when budget is exceeded!

```bash
# Create a Pub/Sub topic for budget alerts
gcloud pubsub topics create budget-alerts

# Create a Cloud Function that disables billing
# (See example function below)
```

**budget-stop-billing/index.js:**

```javascript
const { CloudBillingClient } = require('@google-cloud/billing')
const billingClient = new CloudBillingClient()

exports.stopBilling = async (pubsubEvent) => {
  const pubsubData = JSON.parse(Buffer.from(pubsubEvent.data, 'base64').toString())

  if (pubsubData.costAmount >= pubsubData.budgetAmount) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT
    const projectName = `projects/${projectId}`

    // Disable billing
    await billingClient.updateProjectBillingInfo({
      name: projectName,
      projectBillingInfo: {
        billingAccountName: '', // Disables billing
      },
    })

    console.log(`Billing disabled for project ${projectId}`)
  }
}
```

### Option 2: Scale Down Functions (Safer)

Create a Cloud Function that reduces instance counts:

```javascript
const { FunctionsClient } = require('@google-cloud/functions')
const functionsClient = new FunctionsClient()

exports.scaleFunctions = async () => {
  const functions = await functionsClient.listFunctions({
    parent: 'projects/lifeos-pi/locations/us-central1',
  })

  for (const func of functions[0]) {
    await functionsClient.updateFunction({
      function: {
        name: func.name,
        maxInstances: 1, // Limit to 1 concurrent instance
      },
    })
  }

  console.log('Functions scaled down to prevent cost overrun')
}
```

### Option 3: Send Slack/Discord Alert

```javascript
const fetch = require('node-fetch')

exports.sendAlert = async (pubsubEvent) => {
  const pubsubData = JSON.parse(Buffer.from(pubsubEvent.data, 'base64').toString())

  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify({
      text: `⚠️ Budget Alert: ${pubsubData.costAmount}/${pubsubData.budgetAmount} USD spent`,
    }),
  })
}
```

---

## Step 5: Monitor Usage Regularly

### Daily Monitoring (Automated)

Set up a daily report email:

1. Go to **Billing** → **Reports**
2. Click **Schedule report**
3. Configure:
   - Frequency: Daily
   - Email: your-email@example.com
   - Include: Cost breakdown by service

### Weekly Review (Manual)

Every Monday:

1. Check **Firebase Console** → **Usage and billing**
2. Review trends for:
   - Firestore reads/writes
   - Cloud Functions invocations
   - Storage usage
3. Investigate any unusual spikes

### Monthly Review (Manual)

First of each month:

1. Review total spend vs budget
2. Analyze cost by service
3. Identify optimization opportunities
4. Adjust budgets if needed

---

## Cost Optimization Tips

### 1. Optimize Firestore Queries

```javascript
// Bad: Reads entire collection
const allDocs = await db.collection('events').get()

// Good: Only read what you need
const recentDocs = await db.collection('events').where('date', '>=', startDate).limit(100).get()
```

### 2. Use Caching for Functions

```javascript
// Cache expensive operations
let cachedConfig = null
let cacheTime = 0

export const getConfig = async () => {
  const now = Date.now()

  // Cache for 1 hour
  if (cachedConfig && now - cacheTime < 3600000) {
    return cachedConfig
  }

  cachedConfig = await fetchConfig()
  cacheTime = now
  return cachedConfig
}
```

### 3. Batch Firestore Operations

```javascript
// Bad: Multiple writes
for (const doc of docs) {
  await db.collection('events').doc(doc.id).set(doc)
}

// Good: Batch write
const batch = db.batch()
for (const doc of docs) {
  batch.set(db.collection('events').doc(doc.id), doc)
}
await batch.commit()
```

### 4. Clean Up Old Data

```bash
# Delete old backups
gsutil -m rm -r gs://lifeos-pi.appspot.com/backups/2024*

# Archive old Firestore data (move to cheaper storage)
firebase firestore:export gs://lifeos-pi-archive/2024
```

---

## Quick Reference Commands

```bash
# View current month's costs
gcloud billing budgets list --billing-account=BILLING_ACCOUNT_ID

# Check Firestore usage
firebase firestore:stats

# List all Cloud Functions and their memory allocation
firebase functions:list

# Check Cloud Storage usage
gsutil du -sh gs://lifeos-pi.appspot.com/

# View billing report
gcloud alpha billing accounts get-billing-info lifeos-pi
```

---

## Alert Response Playbook

### When You Receive 50% Alert ($5)

**Action:** Review usage, no immediate action needed

1. Check which service is using most resources
2. Look for unusual patterns
3. Verify expected vs actual usage

### When You Receive 90% Alert ($9)

**Action:** Investigate and prepare to act

1. Identify the cause of high usage
2. Check for runaway functions or queries
3. Prepare to disable non-critical features
4. Alert team members

### When You Receive 100% Alert ($10)

**Action:** Take immediate action

1. Disable non-critical Cloud Functions
2. Reduce instance counts to minimum
3. Investigate root cause
4. Consider temporary service pause

---

## Recommended Budget Tiers

### Tier 1: Personal/Hobby ($10/month)

- Good for: Solo developer, < 100 users
- Configure: $10 budget with 50/90/100% alerts
- Action at 100%: Disable non-essential functions

### Tier 2: Small Business ($50/month)

- Good for: < 1,000 users, light commercial use
- Configure: $50 budget with 75/90/100% alerts
- Action at 100%: Scale down, investigate

### Tier 3: Growing Business ($200/month)

- Good for: < 10,000 users, active commercial use
- Configure: $200 budget with 90/95/100% alerts
- Action at 100%: Emergency scale-down, team alert

---

## Next Steps

1. ✅ **Create main budget** ($10/month for personal use)
2. 📧 **Add email alerts** (50%, 90%, 100%)
3. 📊 **Enable daily usage reports**
4. ⏰ **Set calendar reminder** for monthly review
5. 📝 **Document alert response** procedures for team

---

## Resources

- [Google Cloud Budgets Guide](https://cloud.google.com/billing/docs/how-to/budgets)
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Cloud Functions Pricing](https://cloud.google.com/functions/pricing)
- [Firestore Pricing](https://firebase.google.com/docs/firestore/quotas)
- [Cost Optimization Best Practices](https://cloud.google.com/architecture/framework/cost-optimization)

---

**Status:** ⚠️ Not yet configured
**Priority:** High - Prevents unexpected bills
**Action Required:** Set up $10 monthly budget with alerts in Google Cloud Console
