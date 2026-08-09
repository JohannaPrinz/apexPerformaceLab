# Apex OS – User Flows

> Object definitions and their rules live in
> [DOMAIN_DECISIONS.md](./DOMAIN_DECISIONS.md), which applies in case of doubt.

---

## Philosophy

Every workflow follows the same scientific process:

```
Question → Assessment → Evidence → Insight → Recommendation → Re-Assessment
```

Every workflow operates within the same hierarchy:

```
Workspace → Athlete → Performance Case → Assessment → Module → Measurement
```

Carrying out a recommendation is a status on that recommendation,
not a separate step.

---

## 1. New Athlete

```
Coach Registration
  ↓
Create Athlete
  ↓
Create Performance Case
  ↓
Define Goals
```

A Case is required, but it is never a manual detour: starting an Assessment
for an athlete without an open Case creates one automatically.

---

## 2. Performance Assessment

```
Create Performance Case
  ↓
Create Assessment
  ↓
State the Question the Assessment answers
  ↓
Select Modules (individually or via a Preset)
  ↓
Perform Measurements
  ↓
Upload Videos
  ↓
Upload Documents
  ↓
Create Insights and link their Evidence
  ↓
Create Recommendations from those Insights
  ↓
Generate Module Reports
  ↓
Generate Assessment Report
  ↓
Generate Case Report (optional)
  ↓
Publish — content becomes immutable
  ↓
Share with Athlete
  ↓
Review with Athlete
  ↓
Schedule Follow-Up (optional)
```

Publishing and sharing are separate steps. Publishing freezes the content;
sharing decides who may see it.

---

## 3. Follow-Up

```
Open Case
  ↓
Create Re-Assessment
  ↓
Compare with previous Assessments, module by module
  ↓
Write new Insights
  ↓
Write new Recommendations
  ↓
Update the status of earlier Recommendations
  ↓
Publish new Reports
  ↓
Close Case (optional)
```

Published Insights, Recommendations and Reports are never edited.
A changed conclusion is a new Report version or a new Assessment.
Only the _status_ of an earlier Recommendation may change —
its content stays as published.

---

## 4. Long-Term Coaching

```
Performance Case remains open
  ↓
Regular Assessments
  ↓
Program updates
  ↓
Athlete or Coach uploads videos (optional)
  ↓
Coach Feedback
  ↓
New Insights
  ↓
New Recommendations
  ↓
Share Reports
  ↓
Share Documents
  ↓
Repeat
```

---

## 5. Athlete Portal

```
Login
  ↓
View Performance Cases
  ↓
Open shared Reports
  ↓
Upload Videos (optional)
  ↓
Upload Documents (optional)
  ↓
Write a Note (optional)
  ↓
View Recommendations
  ↓
Mark assigned Recommendations as done
  ↓
View shared Documents
  ↓
View shared Videos
  ↓
View shared Programs
  ↓
View shared Notes
  ↓
View Appointments
```

The Athlete only ever sees what the Coach has explicitly shared. Notes the
Athlete writes go the other way and reach the Coach immediately.

---

## 6. Appointment Management

```
Coach creates Appointment
  ↓
Link to a Performance Case (optional)
  ↓
Invite Athlete
  ↓
Online Meeting (optional)
  ↓
Save Notes (optional)
  ↓
Follow-Up
```

An initial consultation takes place before any Case exists,
which is why the Case link is optional.

---

## 7. Report Generation

```
Module
  ↓
Measurements
  ↓
Insights with their Evidence
  ↓
Recommendations
  ↓
Interactive Module Report (DRAFT)
  ↓
Publish (PUBLISHED — immutable)
  ↓
PDF Export (optional)
  ↓
Share via secure link (optional)
```

---

## 8. Progress Review

```
Select Athlete
  ↓
Open Performance Case
  ↓
Compare Assessments module by module
  ↓
Review Progress
  ↓
Update the status of existing Recommendations
  ↓
Plan Next Assessment
```

New conclusions become a new Assessment.
Published results are never rewritten.

---

## 9. Athlete Timeline

```
Select Athlete
  ↓
Open Timeline
  ↓
All Assessments, Reports, Measurements, Documents, Videos,
Programs, Recommendations and Appointments in chronological order
  ↓
Jump to any entry
```

The timeline spans all Performance Cases of the athlete.
