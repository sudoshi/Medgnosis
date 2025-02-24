export function generateStaticParams() {
  // For now, we'll pre-render just one sample patient page
  // In production, this would fetch all patient IDs from an API
  return [
    { id: '123456' }
  ];
}
