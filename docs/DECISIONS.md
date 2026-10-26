# Decisions

- NestJS 11, Mongoose 8, Node 26.
- No Docker for development or tests; tests use mongodb-memory-server (MongoMemoryReplSet). docker-compose.yml is provided for optional use only.
- Permissions (@lc/shared, one per PRD §3 row; S cells allowed at role level): leads.create, students.create, enrollments.updateCourse, courses.manage, rooms.manage, placement.schedule, placement.grade, classes.manage, enrollments.assign, enrollments.confirm, students.search, students.viewProfile, students.update, sessions.manage, sessions.view, attendance.take, attendance.viewHistory, grades.enter, grades.view, fees.update, discounts.decide, fees.view, reports.view, users.manage (ADMIN+MANAGER), settings.update (MANAGER only; not in PRD matrix).
