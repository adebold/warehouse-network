import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@warehouse-network/db/src/client'

const generateSitemap = (cityPages: { slug: string }[]) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
  </url>
  <url>
    <loc>${baseUrl}/how-it-works</loc>
  </url>
  <url>
    <loc>${baseUrl}/list-your-warehouse</loc>
  </url>
  <url>
    <loc>${baseUrl}/pricing</loc>
  </url>
  <url>
    <loc>${baseUrl}/faq</loc>
  </url>
`

  cityPages.forEach(page => {
    sitemap += `
  <url>
    <loc>${baseUrl}/warehouse-space/${page.slug}</loc>
  </url>`
  })

  sitemap += `
</urlset>`

  return sitemap
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const cityPages = await prisma.cityPage.findMany({
    where: { isActive: true },
    select: { slug: true },
  })

  res.setHeader('Content-Type', 'text/xml')
  res.write(generateSitemap(cityPages))
  res.end()
}
