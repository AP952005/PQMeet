import { Mic, MicOff } from 'lucide-react';

interface ParticipantCardProps {
  displayName: string;
  isMuted: boolean;
  isSelf: boolean;
  isSpeaking?: boolean;
}

export default function ParticipantCard({ displayName, isMuted, isSelf, isSpeaking }: ParticipantCardProps) {
  const initial = (displayName || 'U')[0].toUpperCase();
  
  const colors = [
    'bg-primary', 'bg-meet-green', 'bg-meet-teal', 'bg-meet-yellow', 'bg-meet-red'
  ];
  const colorIndex = displayName.charCodeAt(0) % colors.length;

  return (
    <div className={`relative rounded-2xl bg-meet-participant-bg flex flex-col items-center justify-center aspect-video transition-all ${
      isSpeaking ? 'ring-2 ring-primary ring-offset-2 ring-offset-meet-surface-dark' : ''
    }`}>
      <div className={`w-20 h-20 rounded-full ${colors[colorIndex]} flex items-center justify-center text-3xl font-display font-bold text-primary-foreground mb-3`}>
        {initial}
      </div>
      <span className="text-meet-toolbar-foreground text-sm font-medium">
        {displayName}{isSelf ? ' (You)' : ''}
      </span>

      {/* Mute indicator */}
      <div className="absolute bottom-3 right-3">
        {isMuted ? (
          <div className="w-7 h-7 rounded-full bg-meet-red/80 flex items-center justify-center">
            <MicOff className="w-3.5 h-3.5 text-meet-red-foreground" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-meet-toolbar-foreground/10 flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-meet-toolbar-foreground/70" />
          </div>
        )}
      </div>

      {/* Speaking animation */}
      {isSpeaking && !isMuted && (
        <div className="absolute bottom-3 left-3 flex items-end gap-0.5 h-4">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-1 bg-primary rounded-full animate-speaking-wave"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
