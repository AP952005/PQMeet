import { X, Mic, MicOff, Shield } from 'lucide-react';

interface Participant {
  userId: string;
  displayName: string;
  isMuted: boolean;
}

interface ParticipantsPanelProps {
  participants: Participant[];
  currentUserId: string;
  onClose: () => void;
}

export default function ParticipantsPanel({ participants, currentUserId, onClose }: ParticipantsPanelProps) {
  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full pb-20">
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        <span className="font-display font-semibold text-card-foreground">
          People ({participants.length})
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {participants.map(p => (
          <div key={p.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium flex-shrink-0">
              {(p.displayName || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-card-foreground truncate block">
                {p.displayName}{p.userId === currentUserId ? ' (You)' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-meet-green" />
              {p.isMuted ? (
                <MicOff className="w-4 h-4 text-meet-red" />
              ) : (
                <Mic className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
