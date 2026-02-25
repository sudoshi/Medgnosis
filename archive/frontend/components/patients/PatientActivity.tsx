import { ClockIcon } from '@heroicons/react/24/outline';

interface ActivityEvent {
  id: number;
  type: 'encounter' | 'procedure' | 'order' | 'result';
  patient: string;
  description: string;
  date: string;
  encounterType?: string;
  provider?: string;
  specialty?: string;
  status?: string;
  priority?: 'high' | 'medium' | 'low';
}

interface PatientActivityProps {
  events: ActivityEvent[];
  loading?: boolean;
}

function ActivityCard({ event }: { event: ActivityEvent }) {
  const getEventStyle = () => {
    switch (event.type) {
      case 'encounter':
        if (event.encounterType === 'Emergency') {
          return 'bg-accent-error/10 border-accent-error/20 text-accent-error';
        }
        return 'bg-accent-warning/10 border-accent-warning/20 text-accent-warning';
      case 'procedure':
        return 'bg-accent-primary/10 border-accent-primary/20 text-accent-primary';
      case 'order':
      case 'result':
        return 'bg-accent-success/10 border-accent-success/20 text-accent-success';
      default:
        return 'bg-dark-secondary/30 border-dark-secondary/20';
    }
  };

  return (
    <div className={`p-3 rounded-lg border ${getEventStyle()}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{event.patient}</div>
          <div className="text-sm text-dark-text-secondary">
            {event.description}
            {event.provider && ` • ${event.provider}`}
            {event.specialty && ` • ${event.specialty}`}
          </div>
        </div>
        <div className="text-sm text-dark-text-secondary">
          {event.date}
        </div>
      </div>
    </div>
  );
}

export default function PatientActivity({ events, loading }: PatientActivityProps) {
  if (loading) {
    return (
      <div className="panel-analytics animate-pulse">
        <div className="h-6 w-48 bg-dark-secondary/30 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-dark-secondary/30 rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Group events by type
  const emergencyEvents = events.filter(e => e.type === 'encounter' && e.encounterType === 'Emergency');
  const specialtyEvents = events.filter(e => e.type === 'encounter' && e.encounterType === 'Specialty');
  const procedureEvents = events.filter(e => e.type === 'procedure');
  const completedEvents = events.filter(e => e.type === 'order' || e.type === 'result');

  return (
    <div className="panel-analytics">
      <div className="flex items-center space-x-2 mb-4">
        <ClockIcon className="h-5 w-5 text-dark-text-secondary" />
        <h3 className="text-lg font-semibold text-dark-text-primary">Patient Activity</h3>
      </div>

      <div className="space-y-4">
        {/* Emergency Encounters */}
        {emergencyEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-accent-error">Emergency/Urgent Care</h4>
            <div className="space-y-2">
              {emergencyEvents.map(event => (
                <ActivityCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* Specialty Care */}
        {specialtyEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-accent-warning">Specialty Care</h4>
            <div className="space-y-2">
              {specialtyEvents.map(event => (
                <ActivityCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* Procedures */}
        {procedureEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-accent-primary">Procedures</h4>
            <div className="space-y-2">
              {procedureEvents.map(event => (
                <ActivityCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* Completed Orders & Results */}
        {completedEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-accent-success">Completed Orders & Results</h4>
            <div className="space-y-2">
              {completedEvents.map(event => (
                <ActivityCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
