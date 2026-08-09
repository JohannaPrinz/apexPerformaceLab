# appointments

Scheduled events: initial consultations, training sessions, assessments,
follow-ups, online meetings, race support and competitions.

An Appointment belongs to an Athlete. The Performance Case is **optional** — an
initial consultation takes place before any Case exists, which is exactly why
this link cannot be mandatory.

Competitions are Appointments, not a separate object. They anchor the athlete's
timeline against goals such as "Sub 60 HYROX".

## Scope

- Creating and scheduling appointments
- Optional link to a Performance Case
- Inviting the Athlete
- Notes captured during the appointment
- Appointment types, including `FOLLOW_UP` and competitions

## Constraint

The calendar function is supporting, not product core. This slice serves the
coaching process; it does not define the platform.

## Follow-Up

A Follow-Up is a workflow, not an object. Concretely it is an Appointment of
type `FOLLOW_UP` and/or an Assessment of type `FOLLOW_UP` or `RE_ASSESSMENT`.
This slice owns the appointment half.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §20, §23._
