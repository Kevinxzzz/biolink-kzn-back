import { PrismaClient, UserRole, Platform } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { env } from "../src/shared/config/env";
import { normalizeDomain } from "../src/shared/utils/domain";

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

    const ownerRole = await prisma.role.findFirst({
        where: { role: UserRole.OWNER }
    });

    if (!ownerRole) {
        throw new Error("Role OWNER not found.");
    }

    const hashedPassword = await bcrypt.hash("dev@senha00", 10);

    // Seed Applications, Enterprises, Users and Categories
    const applications = [
        { name: "KZN", domain: env.KZN_URL! },
        { name: "ALECIO", domain: env.ALECIO_URL! },
    ];

    const devCategories = [
        "efootball",
        "Redes Sociais",
        "Promocional",
        "Parcerias",
        "Suporte"
    ];

    for (let i = 0; i < applications.length; i++) {
        const app = applications[i];
        const normalizedDomain = normalizeDomain(app.domain);

        const appRecord = await prisma.application.upsert({
            where: { domain: normalizedDomain },
            update: { name: app.name },
            create: {
                name: app.name,
                domain: normalizedDomain
            }
        });
        console.log(`Application '${app.name}' ensured with domain '${normalizedDomain}'.`);

        // Dados da empresa para cada application
        // A tabela enterprise possui restrição UNIQUE para 'email' e 'phone_number'.
        // Usamos dev@gmail.com na primeira e aliases (ex: dev+alecio@gmail.com) para as demais, garantindo a unicidade no banco.
        const devEnterpriseEmail = i === 0 ? "dev@gmail.com" : `dev+${app.name.toLowerCase()}@gmail.com`;
        const devEnterpriseName = "dev";
        const devEnterprisePhone = `8399991136${3 + i}`;

        // Desassocia o applicationId de qualquer outra empresa para evitar violação de unique
        await prisma.enterprise.updateMany({
            where: {
                applicationId: appRecord.id,
                email: { not: devEnterpriseEmail }
            },
            data: {
                applicationId: null
            }
        });

        const devEnterprise = await prisma.enterprise.upsert({
            where: { email: devEnterpriseEmail },
            update: {
                name: devEnterpriseName,
                phoneNumber: devEnterprisePhone,
                applicationId: appRecord.id,
                updateAt: new Date(),
            },
            create: {
                name: devEnterpriseName,
                email: devEnterpriseEmail,
                phoneNumber: devEnterprisePhone,
                applicationId: appRecord.id,
                createAt: new Date(),
                updateAt: new Date(),
            }
        });
        console.log(`Dev enterprise '${devEnterprise.name}' ensured for '${app.name}' (${devEnterpriseEmail}).`);

        // Seed Dev User para esta empresa (permite o mesmo login dev@gmail.com em todas as aplicações)
        const devUser = await prisma.user.upsert({
            where: {
                email_enterpriseId: {
                    email: "dev@gmail.com",
                    enterpriseId: devEnterprise.id,
                }
            },
            update: {
                name: "dev",
                password: hashedPassword,
                roleId: ownerRole.id,
                updateAt: new Date(),
            },
            create: {
                name: "dev",
                email: "dev@gmail.com",
                password: hashedPassword,
                roleId: ownerRole.id,
                enterpriseId: devEnterprise.id,
                createAt: new Date(),
                updateAt: new Date(),
            }
        });
        console.log(`Dev user '${devUser.email}' ensured for application '${app.name}'.`);

        // Seed Categorias e Links para a empresa
        for (let catIdx = 0; catIdx < devCategories.length; catIdx++) {
            const categoryName = devCategories[catIdx];

            const category = await prisma.enterpriseCategory.upsert({
                where: {
                    name_enterpriseId: {
                        name: categoryName,
                        enterpriseId: devEnterprise.id,
                    }
                },
                update: {
                    updateAt: new Date(),
                },
                create: {
                    name: categoryName,
                    enterpriseId: devEnterprise.id,
                    createAt: new Date(),
                    updateAt: new Date(),
                    categoryRotation: {
                        create: {
                            updateAt: new Date(),
                        }
                    }
                }
            });

            await prisma.categoryRotation.upsert({
                where: {
                    categoryId: category.id,
                },
                update: {},
                create: {
                    categoryId: category.id,
                    updateAt: new Date(),
                }
            });

            const activeLinkInCat = await prisma.enterpriseUrl.findFirst({
                where: {
                    categoryId: category.id,
                    enterpriseId: devEnterprise.id,
                    active: true,
                }
            });

            for (let linkIdx = 1; linkIdx <= 5; linkIdx++) {
                const slug = categoryName.toLowerCase().replace(/[^a-z0-9]/g, "");
                const url = `https://${slug}-link${linkIdx}-${app.name.toLowerCase()}.example.com`;
                const title = `${categoryName} - Link ${linkIdx}`;
                const shouldBeActive = !activeLinkInCat && linkIdx === 1;

                await prisma.enterpriseUrl.upsert({
                    where: {
                        url_enterpriseId: {
                            url,
                            enterpriseId: devEnterprise.id,
                        }
                    },
                    update: {
                        title,
                        categoryId: category.id,
                        order: linkIdx,
                        updateAt: new Date(),
                    },
                    create: {
                        title,
                        url,
                        countClicks: 0,
                        active: shouldBeActive,
                        order: linkIdx,
                        inRotationPool: true,
                        enterpriseId: devEnterprise.id,
                        categoryId: category.id,
                        createAt: new Date(),
                        updateAt: new Date(),
                    }
                });
            }
        }
        console.log(`Categories and links ensured for enterprise '${devEnterprise.name}' in '${app.name}'.`);
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
