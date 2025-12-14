import type { NextPage, GetServerSideProps } from 'next'
import prisma from '../lib/prisma'
import type { Warehouse } from '@prisma/client'

interface SearchResultsProps {
  warehouses: Warehouse[]
}

const SearchResults: NextPage<SearchResultsProps> = ({ warehouses }) => {
  return (
    <div>
      <h1>Search Results</h1>
      {warehouses.length === 0 ? (
        <p>No warehouses found matching your criteria.</p>
      ) : (
        <ul>
          {warehouses.map(warehouse => (
            <li key={warehouse.id}>
              <h2>{warehouse.name}</h2>
              <p>{warehouse.address}</p>
              <p>Capacity: {warehouse.capacity} pallet positions</p>
              <p>Supported Goods: {warehouse.supportedGoods}</p>
              {/* Add more details and a link to request a quote */}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { location, skidCount } = context.query

  const warehouses = await prisma.warehouse.findMany({
    where: {
      status: 'READY_FOR_MARKETPLACE',
      // Basic location filter (can be improved with geo-spatial search)
      address: {
        contains: String(location),
        mode: 'insensitive',
      },
      capacity: {
        gte: parseInt(String(skidCount), 10) || 0,
      },
    },
  })

  // TODO: Implement advanced matching heuristics (price, proximity, SLA, etc.)

  return {
    props: {
      warehouses: JSON.parse(JSON.stringify(warehouses)),
    },
  }
}

export default SearchResults
