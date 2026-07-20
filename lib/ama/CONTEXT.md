# AMA Booking

AMA Booking covers the paid one-to-one sessions Cali offers through the site,
from choosing a time through the session's completion.

## Language

**AMA Session**:
A paid 60-minute one-to-one conversation with Cali about one or more topics
chosen by the guest.
_Avoid_: Consultation package, coaching call, appointment

**Guest**:
The person booking and attending an AMA Session.
_Avoid_: Customer, client, attendee

**Booking Brief**:
The guest's short explanation of what would make the AMA Session valuable,
with optional supporting links.
_Avoid_: Application, intake questionnaire, notes

**Availability Window**:
A recurring period when Cali is generally open to AMA Sessions; actual open
times also account for calendar conflicts and booking rules.
_Avoid_: Slot, office hours

**Date Override**:
A schedule date that replaces its recurring Availability Windows with either
no hours or one or more custom intervals.
_Avoid_: Exception slot, blackout event

**Schedule Time Zone**:
The IANA time zone used to interpret recurring Availability Windows and Date
Overrides. It is an owner setting, not the Guest's display time zone.
_Avoid_: Local time, browser time

**Slot Hold**:
A 15-minute temporary claim on an available start time while a guest completes
payment.
_Avoid_: Booking, reservation

**Booking**:
A paid claim on one AMA Session start time, including its guest, Booking Brief,
meeting choice, and lifecycle.
_Avoid_: Appointment, order, transaction

**Finalizing Booking**:
A paid Booking whose meeting or calendar details are still being created and
will be delivered after automatic or manual recovery.
_Avoid_: Failed booking, pending payment

**Alternate Time Request**:
An unpaid request from a guest who cannot use any available start time.
_Avoid_: Waitlist, custom booking

**Manage Link**:
A private capability link that lets a guest view, reschedule, or cancel one
Booking without creating an account.
_Avoid_: Account link, login link
