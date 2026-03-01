import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mic, Shield, Keyboard, Plus, LogOut, X,
  Clock, Users, Lock
} from 'lucide-react';
import { toast } from 'sonner';

export default function Index() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [meetingName, setMeetingName] = useState('');

  const openCreateDialog = () => {
    setMeetingName('');
    setShowNameDialog(true);
  };

  const createMeeting = async () => {
    if (!user) return;
    const title = meetingName.trim() || 'Untitled Meeting';
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('meetings')
        .insert({ created_by: user.id, title })
        .select()
        .single();

      if (error) throw error;
      setShowNameDialog(false);
      navigate(`/meeting/${data.code}`);
    } catch (err: any) {
      toast.error('Failed to create meeting');
    } finally {
      setCreating(false);
    }
  };

  const joinMeeting = () => {
    if (!meetingCode.trim()) {
      toast.error('Please enter a meeting code');
      return;
    }
    navigate(`/meeting/${meetingCode.trim()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Mic className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <span className="text-xl font-display font-semibold text-foreground">SecureVoice</span>
        </div>
        <div className="flex items-center gap-4">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
              {(profile?.display_name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left Column */}
          <div>
            <h1 className="text-5xl font-display font-bold text-foreground leading-tight mb-6">
              Quantum-secure
              <br />
              voice calls
            </h1>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Triple-layer security: Kyber-512 post-quantum key exchange,
              XOR voice obfuscation (identity protection), and AES-256-GCM encryption.
              Secure against classical attacks, quantum computers, and AI voice identification.
            </p>

            <div className="flex items-center gap-3 mb-6">
              <Button
                onClick={openCreateDialog}
                disabled={creating}
                className="h-12 px-6 text-base gap-2 rounded-full"
              >
                <Plus className="w-5 h-5" />
                New meeting
              </Button>

              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Keyboard className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value)}
                    placeholder="Enter a code"
                    className="h-12 pl-10 rounded-full border-border"
                    onKeyDown={(e) => e.key === 'Enter' && joinMeeting()}
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={joinMeeting}
                  disabled={!meetingCode.trim()}
                  className="h-12 px-6 text-base text-primary hover:text-primary rounded-full"
                >
                  Join
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column - Feature Cards */}
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-card-foreground mb-1">Kyber-512 PQC Key Exchange</h3>
                <p className="text-sm text-muted-foreground">CRYSTALS-KYBER 512 post-quantum KEM — resistant to quantum computer attacks (NIST standard)</p>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-meet-green/10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-meet-green" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-card-foreground mb-1">XOR Obfuscation + AES-256-GCM</h3>
                <p className="text-sm text-muted-foreground">Double-lock: XOR scrambling destroys voice fingerprints, then AES-GCM encrypts the obfuscated data</p>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-meet-teal/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-meet-teal" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-card-foreground mb-1">Anti-AI Voice Protection</h3>
                <p className="text-sm text-muted-foreground">Per-chunk SHA-256 key derivation prevents AI speaker identification and spectrogram analysis</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Meeting Name Dialog */}
      {showNameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-semibold text-card-foreground">Create New Meeting</h2>
              <button onClick={() => setShowNameDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-6">
              <label className="text-sm font-medium text-foreground mb-1.5 block">Meeting Name</label>
              <Input
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                placeholder="e.g. Team Standup, Project Review..."
                className="h-11"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createMeeting()}
              />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowNameDialog(false)} className="rounded-full">
                Cancel
              </Button>
              <Button onClick={createMeeting} disabled={creating} className="rounded-full gap-2">
                <Plus className="w-4 h-4" />
                {creating ? 'Creating...' : 'Create Meeting'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
