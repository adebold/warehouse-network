
export default function SkidLabel({ skid }: { skid: any }) {
  return (
    <div className="rounded border p-4">
      <h3>Skid #{skid.id}</h3>
      <p>{skid.description || 'No description'}</p>
    </div>
  );
}
