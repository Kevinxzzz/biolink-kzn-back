import { PrismaClient, UserRole, Platform } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../src/shared/config/env";

const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("Seeding database...");

    // Seed Roles (OWNER, ADMIN)
    const roles: UserRole[] = [UserRole.OWNER, UserRole.ADMIN];
    for (const roleEnum of roles) {
        const existing = await prisma.role.findFirst({
            where: { role: roleEnum }
        });
        if (!existing) {
            await prisma.role.create({
                data: {
                    role: roleEnum,
                    createAt: new Date()
                }
            });
            console.log(`Role '${roleEnum}' created.`);
        } else {
            console.log(`Role '${roleEnum}' already exists.`);
        }
    }

    // Seed Platforms (TIKTOK, INSTAGRAM, YOUTUBE)
    const platforms: Platform[] = [Platform.TIKTOK, Platform.INSTAGRAM, Platform.YOUTUBE];
    for (const platformEnum of platforms) {
        const existing = await prisma.platform.findFirst({
            where: { platform: platformEnum }
        });
        if (!existing) {
            await prisma.platform.create({
                data: {
                    platform: platformEnum,
                    createAt: new Date()
                }
            });
            console.log(`Platform '${platformEnum}' created.`);
        } else {
            console.log(`Platform '${platformEnum}' already exists.`);
        }
    }

    // Seed Categories
    const enterprises = await prisma.enterprise.findMany();
    for (const ent of enterprises) {
        const categoryName = "efootball";

        const category = await prisma.enterpriseCategory.upsert({
            where: {
                name_enterpriseId: {
                    name: categoryName,
                    enterpriseId: ent.id,
                },
            },
            update: {},
            create: {
                name: categoryName,
                enterpriseId: ent.id,
                createAt: new Date(),
                updateAt: new Date(),
                categoryRotation: {
                    create: {
                        updateAt: new Date(),
                    },
                },
            },
        });

        await prisma.categoryRotation.upsert({
            where: {
                categoryId: category.id,
            },
            update: {},
            create: {
                categoryId: category.id,
                updateAt: new Date(),
            },
        });

        console.log(`Category '${categoryName}' and its rotation ensured for enterprise '${ent.name}'.`);
    }

    console.log("Seeding completed successfully.");
}

main()
    .catch((e) => {
        console.error("Error during seeding:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
