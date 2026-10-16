# Gym Slot Booking

Hello Guyz 👋

## Design note

> Stack: Node.js + Express API, MongoDB with Mongoose, plain HTML/CSS/JS single-page frontend served by Express from `public/`.

> Four collections: `User`, `Session`, `Booking`, `Waitlist`. Bookings and waitlist entries reference `Session` and `User` by ObjectId.

> Seats: `Session.bookedCount` is raised with one conditional `findOneAndUpdate` (not started, count below capacity), so two people taking the last seat cannot both succeed.

> Unique indexes enforce the rules in the database: one `startAt` per session, one confirmed booking per member and session (partial index), unique `code`, one waitlist entry per member and session.

> Cancelling promotes the first waitlisted member (oldest `createdAt`) and keeps the seat count unchanged.

> Auth: bcrypt-hashed passwords, JWT bearer token, `auth` middleware on every private route, `admin` middleware on admin routes, ownership check on cancel.

> Check-in codes are 6 random characters from `crypto.randomBytes`, so they cannot be guessed from each other.

> Errors always use `{ "error": { "message": "..." } }`; a global handler hides stack traces.

> Frontend: hash router with protected routes, one `api()` wrapper, optimistic booking with rollback, 5-second polling for seats.

## Setup

Requires Node.js and a running MongoDB.

```bash
npm install
cp .env.example .env     # on Windows PowerShell: copy .env.example .env
# edit .env: set MONGO_URI and a long random JWT_SECRET
node seed.js             # creates test users and sessions (wipes existing data)
npm start                # open http://localhost:3000
```

## Test accounts (created by `node seed.js`)

---------------------------------------------
| Role      | Email             | Password  |
---------------------------------------------
| Admin     | admin@gym.test    | admin123  |

| Member    | riya@gym.test     | member123 |

| Member    | aman@gym.test     | member123 |

---------------------------------------------

Seed data: 8 sessions over the next 3 days. The second session is full (20 bookings from dummy members), so you can test the waitlist.

The admin account exists only in the database (seed script). Registration always creates a `member`.

## API summary

| Method        | Route                                     | Who       |
-------------------------------------------------------------------------
| POST          | `/api/auth/register`, `/api/auth/login`   | public    |

| GET           | `/api/sessions?date=YYYY-MM-DD`           | logged in |

| POST          | `/api/sessions`                           | admin     |

| POST          | `/api/sessions/:id/book`                  | logged in |

| DELETE        | `/api/bookings/:id`                       | owner     |

| GET           | `/api/bookings/me`                        | logged in |

| GET           | `/api/sessions/:id/bookings`              | admin     |

| POST / DELETE | `/api/sessions/:id/waitlist`              | logged in |

| POST          | `/api/checkin`                            | admin     |

-------------------------------------------------------------------------

Status codes: 400 invalid input, 401 not logged in, 403 not allowed, 404 not found, 409 conflict (full, already booked, code already used).

## Assumptions

> The gym runs on Indian Standard Time (IST, UTC+5:30). Session times are stored as UTC dates and shown in IST.

> Capacity is always 20 and sessions last one hour. The admin picks a date and a start hour.

> Sessions can only be created in the future.

> Cancelling and booking again creates a new booking with a new check-in code.

> Cancelled bookings stay in the database with status `cancelled`.

> A member on a waitlist who books directly (a seat opened up) is removed from that waitlist.

> Joining a waitlist is only allowed when the session is full and has not started.

> Check-in works only from the session's start until one hour later, and only once per code.

> Passwords need at least 6 characters.

> Admins cannot book sessions as members in the demo data, but nothing in the API stops an admin account from booking.

## Not done

> Deployment (please running locally only).