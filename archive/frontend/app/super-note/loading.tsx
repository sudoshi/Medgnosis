export default function SuperNoteLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-dark-secondary/30 rounded" />
        <div className="h-10 w-32 bg-dark-secondary/30 rounded" />
      </div>

      {/* SOAP Note Sections */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="panel-analytics">
          <div className="h-6 w-32 bg-dark-secondary/30 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-dark-secondary/30 rounded" />
            <div className="h-4 w-3/4 bg-dark-secondary/30 rounded" />
            <div className="h-4 w-5/6 bg-dark-secondary/30 rounded" />
          </div>
        </div>
      ))}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4">
        <div className="h-10 w-24 bg-dark-secondary/30 rounded" />
        <div className="h-10 w-24 bg-dark-secondary/30 rounded" />
      </div>
    </div>
  );
}
