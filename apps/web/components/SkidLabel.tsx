import React from 'react';

export default function SkidLabel({ skid }: { skid: any }) {
  return (
    <div className="p-4 border rounded">
      <h3>Skid #{skid.id}</h3>
      <p>{skid.description || 'No description'}</p>
    </div>
  );
}
