# 🥻 Vastra Saree CRM — Backend API

Express + MongoDB (Mongoose) REST API with JWT authentication for the Vastra Saree CRM.

## 🚀 Getting started

```bash
npm install
cp .env.example .env     # then fill in MONGO_URI and JWT_SECRET
npm run dev              # http://localhost:5000
```

On first run the server connects to MongoDB, seeds demo data, and creates a
default admin account:

| Email | Password |
| --- | --- |
| `riya@vastrasarees.in` | `password` |

## ⚙️ Environment (`.env`)

| Key | Description |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `CLIENT_URL` | Frontend origin (CORS) |

## 🔌 API

All resource routes require an `Authorization: Bearer <token>` header.

| Resource | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/login` · `POST /api/auth/register` · `GET /api/auth/me` |
| Products | `GET/POST /api/products` · `POST /api/products/bulk` · `PUT /:id` · `PATCH /:id/restock` · `DELETE /:id` |
| Customers | `GET/POST /api/customers` · `PUT /:id` · `DELETE /:id` |
| Categories | `GET/POST /api/categories` · `PUT /:id` · `DELETE /:id` |
| Orders | `GET/POST /api/orders` · `PUT /:id` · `DELETE /:id` |
| Payments | `GET/POST /api/payments` · `PATCH /:id/paid` · `PATCH /:id/refund` |
| Admin | `POST /api/admin/reset` (re-seed demo data) |
| Health | `GET /api/health` |

## 🧱 Structure

```
src/
  config/db.js        # Mongo connection
  models/             # User, Product, Customer, Category, Order, Payment
  controllers/        # request handlers
  routes/             # Express routers
  middleware/         # auth (JWT), error handler
  utils/              # id generation, async wrapper
  seed.js / seedData.js
  index.js            # app entry
```

## 🛠 Tech

Node.js · Express · MongoDB · Mongoose · JWT · bcryptjs
