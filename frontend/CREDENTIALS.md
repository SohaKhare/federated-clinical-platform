# Frontend Dashboard Credentials & Routing Guide

This document outlines the current mock credentials and available routes for the Federated Clinical Platform frontend dashboard.

## 🔐 Login Credentials

The frontend is currently using a **mock authentication system**. You can use any valid format to log in during development.

- **Email:** `local@gmail.com` (or any string)
- **Password:** `12345` (or any string)

When you click "Sign In", the application will automatically redirect you to the main dashboard (`/`). The mock `lib/api.ts` will return a mock token and set your session as the user **Nika Meyer**.

## 🗺️ Available Routes

The application has been built end-to-end with the following active routes that map to the Local Node endpoints:

| Page / Component    | Route            | Description                                                                                           | Backend Mapping                                   |
| :------------------ | :--------------- | :---------------------------------------------------------------------------------------------------- | :------------------------------------------------ |
| **Login**           | `/login`         | The authentication entry point.                                                                       | `POST /auth/login`                                |
| **Dashboard**       | `/`              | The main overview featuring the platform summary, predictions chart, demographics, logs, and heatmap. | `/research/summary`, `/logs`, `/heatmap`          |
| **Patients**        | `/patients`      | A table view of all registered patients with their risk levels and recent events.                     | `GET /patients`                                   |
| **Patient Details** | `/patients/[id]` | Detailed view of a single patient, their conditions, and medical history.                             | `GET /patients/{id}`, `GET /patients/{id}/events` |
| **Logs**            | `/logs`          | A structured table for all federated data exchange events and metadata.                               | `GET /logs`                                       |

## 🛠️ Data Integration (`lib/api.ts`)

All the data populating these pages is currently being served by a mock API service located at `lib/api.ts`. Once your actual backend is running, you can swap out the mock return statements in this file with standard `fetch()` calls to your backend URLs (e.g., `http://localhost:8000/patients`).
