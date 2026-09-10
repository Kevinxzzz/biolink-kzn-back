import { prisma } from './src/shared/database/prisma';

async function runIntegrationTest() {
  console.log("Iniciando testes de integração com banco real...");
  
  // 1. Setup Data
  const app = await prisma.application.create({
    data: { name: "Test App", domain: `test-${Date.now()}.com` }
  });

  const ent = await prisma.enterprise.create({
    data: {
      name: "Integration Test Enterprise",
      email: `test-${Date.now()}@test.com`,
      phoneNumber: `+5511999${Date.now().toString().slice(-4)}`,
      applicationId: app.id,
      createAt: new Date(),
      updateAt: new Date()
    }
  });

  const catA = await prisma.enterpriseCategory.create({
    data: { name: "Category A", enterpriseId: ent.id, createAt: new Date(), updateAt: new Date() }
  });
  
  const catB = await prisma.enterpriseCategory.create({
    data: { name: "Category B", enterpriseId: ent.id, createAt: new Date(), updateAt: new Date() }
  });

  const link1 = await prisma.enterpriseUrl.create({
    data: { title: "Link 1", url: `http://link1-${Date.now()}.com`, countClicks: 0, active: false, order: 1, enterpriseId: ent.id, categoryId: catA.id, createAt: new Date(), updateAt: new Date() }
  });

  const link2 = await prisma.enterpriseUrl.create({
    data: { title: "Link 2", url: `http://link2-${Date.now()}.com`, countClicks: 0, active: false, order: 2, enterpriseId: ent.id, categoryId: catA.id, createAt: new Date(), updateAt: new Date() }
  });

  const link3 = await prisma.enterpriseUrl.create({
    data: { title: "Link 3", url: `http://link3-${Date.now()}.com`, countClicks: 0, active: false, order: 1, enterpriseId: ent.id, categoryId: catB.id, createAt: new Date(), updateAt: new Date() }
  });

  try {
    console.log("Teste 1: Ativar link 1 (Categoria A)");
    await prisma.enterpriseUrl.update({ where: { id: link1.id }, data: { active: true } });
    console.log("✔ Sucesso");

    console.log("Teste 2: Ativar link 3 (Categoria B)");
    await prisma.enterpriseUrl.update({ where: { id: link3.id }, data: { active: true } });
    console.log("✔ Sucesso - Isolamento por categoria funcionando (Categorias diferentes podem ter ativos simultaneamente)");

    console.log("Teste 3: Tentar ativar link 2 (Categoria A) sem desativar o link 1");
    let failed = false;
    try {
      await prisma.enterpriseUrl.update({ where: { id: link2.id }, data: { active: true } });
    } catch (e: any) {
      if (e.code === 'P2002') {
        failed = true;
      } else {
        throw e;
      }
    }
    
    if (failed) {
      console.log("✔ Sucesso - O banco bloqueou múltiplos ativos na mesma categoria via Constraint P2002!");
    } else {
      throw new Error("❌ Falha - O banco PERMITIU dois ativos na mesma categoria!");
    }

  } finally {
    // Teardown
    console.log("Limpando dados de teste...");
    await prisma.enterprise.delete({ where: { id: ent.id } });
    await prisma.application.delete({ where: { id: app.id } });
    await prisma.$disconnect();
    console.log("Testes finalizados.");
  }
}

runIntegrationTest().catch(console.error);
