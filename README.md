# 🏦 NexusPay Engine Backend

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

A high-performance, event-driven backend for a FinTech wallet application. This API handles secure money transfers using a two-step Intent/Execute architecture, pessimistic database locking to prevent double-spending, and Apache Kafka for asynchronous event notifications.

## 🚀 System Architecture & Features
* **Two-Step Payment Flow:** Modeled after UPI/Stripe, separating transaction intent from execution.
* **Idempotency & Concurrency Control:** Implemented PostgreSQL pessimistic locking (`FOR UPDATE`) and mathematical lock-ordering to prevent deadlocks and race conditions during high-frequency network retries.
* **Event-Driven Microservices:** Integrated **Apache Kafka** to decouple core synchronous banking logic from asynchronous side-effects (like email notifications).
* **Distributed Rate Limiting:** Utilized **Redis** to prevent brute-force login attacks and API abuse.
* **Automated Reconciliation:** Built a Node-Cron sweeper job to automatically expire abandoned transaction intents and keep the database state clean.

## 🛠️ Tech Stack
* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL
* **Message Broker:** Apache Kafka / KafkaJS
* **Caching & Rate Limiting:** Redis
* **Security:** JWT Authentication, bcrypt, Helmet.js

---

## 💻 How to Run Locally

Because this project relies on specific database engines and message brokers, please ensure you have **PostgreSQL**, **Redis**, and **Apache Kafka** running on your local machine before starting.

### 1. Clone the repository
```bash
git clone [https://github.com/YOUR_USERNAME/fintech-wallet-backend.git](https://github.com/YOUR_USERNAME/fintech-wallet-backend.git)
cd fintech-wallet-backend
npm install
