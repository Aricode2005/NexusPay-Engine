# 🏦 Scalable FinTech Wallet Backend

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

An event-driven, highly concurrent core banking API designed to process financial transactions with strict ACID guarantees, distributed rate limiting, and asynchronous notifications.

## 🚀 System Architecture

This project implements a decoupled microservices architecture to ensure high availability and prevent database lock contention during traffic spikes.

```mermaid
graph TD
    Client[Mobile/Web Client] -->|JWT Auth + Idempotency Key| API(Express API Gateway)
    API -->|Check TTL / Quota| Cache[(Redis Cache)]
    API -->|SELECT ... FOR UPDATE| DB[(PostgreSQL)]
    API -->|Fire & Forget Event| Broker((Apache Kafka))
    Broker -->|Consume Event| Worker[Notification Node]
    Worker -->|Delay/Simulate API| Email[External Email Service]