import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Migrations need a direct connection; Neon's pooled URL is for the app itself.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
})
