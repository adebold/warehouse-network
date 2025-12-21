import prisma from '../../db/src/client';
import { UserRole } from '@prisma/client';

const SYSTEM_USER_ID = 'clsys00000000000000000000'; // A fixed ID for the system user

export async function createOrUpdateCityPageForWarehouse(warehouseId: string) {
  let systemUser = await prisma.user.findUnique({
    where: { id: SYSTEM_USER_ID },
  });

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        id: SYSTEM_USER_ID,
        email: 'system@warehouse.network',
        name: 'System User',
        role: UserRole.SUPER_ADMIN,
        // No password needed for a system user that doesn't log in
      },
    });
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: {
      id: true,
      name: true,
      address: true,
      operator: {
        select: {
          legalName: true,
        },
      },
    },
  });

  if (!warehouse) {
    console.error(`Warehouse with ID ${warehouseId} not found.`);
    return;
  }

  // Extract city and region from the address (simplistic for now)
  const addressParts = warehouse.address.split(',').map(s => s.trim());
  const city = addressParts[addressParts.length - 2]; // Assuming city is second to last
  const region = addressParts[addressParts.length - 1]; // Assuming region is last

  if (!city) {
    console.warn(`Could not extract city from warehouse address: ${warehouse.address}`);
    return;
  }

  const slug = `warehouse-space-${city.toLowerCase().replace(/ /g, '-')}`;

  let cityPage = await prisma.cityPage.findUnique({
    where: { slug },
  });

  if (!cityPage) {
    // Create new city page with default content
    cityPage = await prisma.cityPage.create({
      data: {
        slug,
        city,
        region,
        h1: `Warehouse Space in ${city}`,
        introContent: `Discover premium warehouse space in ${city}, perfect for businesses of all sizes. Our network in ${city} offers flexible storage solutions, competitive pricing, and reliable service. Whether you need pallet storage, fulfillment services, or specialized handling, we connect you with the best warehouse partners in the ${city} area.`,
        isActive: true,
        authorId: systemUser.id,
      },
    });
  } else {
    // Update existing page if needed (e.g., re-activate if inactive)
    if (!cityPage.isActive) {
      await prisma.cityPage.update({
        where: { id: cityPage.id },
        data: { isActive: true },
      });
    }
  }

  // Ensure the warehouse is listed on the page (logic to be implemented client-side)
  console.log(`City page ${cityPage.slug} processed for warehouse ${warehouse.name}.`);
}
