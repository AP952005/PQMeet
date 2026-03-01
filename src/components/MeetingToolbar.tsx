import {
  Mic, MicOff, PhoneOff, Users, MessageSquare,
  Shield, ShieldCheck, ShieldAlert, ShieldOff, Activity
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MeetingToolbarProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onToggleMetrics: () => void;
  onToggleDeobfuscation: () => void;
  cryptoStatus: 'none' | 'exchanging' | 'encrypted';
  participantCount: number;
  showParticipants: boolean;
  showChat: boolean;
  showMetrics: boolean;
  deobfuscationEnabled: boolean;
}

export default function MeetingToolbar({
  isMuted, onToggleMute, onLeave,
  onToggleParticipants, onToggleChat, onToggleMetrics, onToggleDeobfuscation,
  cryptoStatus, participantCount,
  showParticipants, showChat, showMetrics, deobfuscationEnabled,
}: MeetingToolbarProps) {
  const CryptoIcon = cryptoStatus === 'encrypted' ? ShieldCheck : cryptoStatus === 'exchanging' ? ShieldAlert : Shield;
  const cryptoLabel = cryptoStatus === 'encrypted' ? 'Kyber-512 + Obfuscation Active' : cryptoStatus === 'exchanging' ? 'Kyber-512 Key Exchange...' : 'Not Encrypted';

  return (
    <div className="absolute bottom-0 left-0 right-0 h-20 bg-meet-toolbar flex items-center justify-center gap-3 px-6">
      {/* Left - Crypto status + De-obfuscation toggle */}
      <div className="absolute left-6 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${cryptoStatus === 'encrypted'
              ? 'bg-meet-green/20 text-meet-green'
              : cryptoStatus === 'exchanging'
                ? 'bg-meet-yellow/20 text-meet-yellow'
                : 'bg-secondary text-muted-foreground'
              }`}>
              <CryptoIcon className="w-3.5 h-3.5" />
              {cryptoLabel}
            </div>
          </TooltipTrigger>
          <TooltipContent>Post-quantum encryption status</TooltipContent>
        </Tooltip>

        {cryptoStatus === 'encrypted' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleDeobfuscation}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${deobfuscationEnabled
                  ? 'bg-primary/20 text-primary'
                  : 'bg-meet-red/20 text-meet-red'
                  }`}
              >
                {deobfuscationEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                {deobfuscationEnabled ? 'De-obfuscation OFF' : 'De-obfuscation ON'}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {deobfuscationEnabled
                ? 'Click to disable de-obfuscation (hear raw obfuscated noise)'
                : 'Click to enable de-obfuscation (hear clear voice)'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Center - Controls */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted
                ? 'bg-meet-red text-meet-red-foreground'
                : 'bg-meet-toolbar-foreground/10 text-meet-toolbar-foreground hover:bg-meet-toolbar-foreground/20'
                }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onLeave}
              className="w-14 h-12 rounded-full bg-meet-red text-meet-red-foreground flex items-center justify-center hover:bg-meet-red/90 transition-colors"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Leave call</TooltipContent>
        </Tooltip>
      </div>

      {/* Right - Side panels */}
      <div className="absolute right-6 flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleParticipants}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors relative ${showParticipants
                ? 'bg-primary/20 text-primary'
                : 'text-meet-toolbar-foreground/70 hover:bg-meet-toolbar-foreground/10'
                }`}
            >
              <Users className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                {participantCount}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Participants</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleChat}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showChat
                ? 'bg-primary/20 text-primary'
                : 'text-meet-toolbar-foreground/70 hover:bg-meet-toolbar-foreground/10'
                }`}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Chat</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleMetrics}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showMetrics
                ? 'bg-primary/20 text-primary'
                : 'text-meet-toolbar-foreground/70 hover:bg-meet-toolbar-foreground/10'
                }`}
            >
              <Activity className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Metrics</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
