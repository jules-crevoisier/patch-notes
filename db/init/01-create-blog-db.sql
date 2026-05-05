-- Crée la base de données du blog (patch_notes) à côté de la base n8n.
-- Ce script ne tourne qu'à la toute première initialisation de Postgres,
-- quand le volume de données est vide.
--
-- Le schéma applicatif (tables, index, foreign keys) est ensuite géré par
-- Prisma Migrate (cf. blog/prisma/migrations/), pas par ce fichier.

SELECT 'CREATE DATABASE patch_notes'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'patch_notes')\gexec
