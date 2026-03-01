import { useState, useEffect, useRef } from 'react';
import { X, Wifi, Shield, Activity, TrendingUp } from 'lucide-react';
import type { NetworkStats, CryptoMetrics } from '@/hooks/useWebRTC';

interface MetricsPanelProps {
    networkStats: NetworkStats | null;
    cryptoMetrics: CryptoMetrics;
    cryptoStatus: string;
    peerCount: number;
    onClose: () => void;
}

interface TimePoint {
    time: number; // timestamp ms
    label: string; // HH:MM:SS
    bitrate: number;
    rtt: number;
    jitter: number;
    packetLoss: number;
    encTime: number;
    decTime: number;
}

/** Simple SVG sparkline chart */
function Sparkline({ data, color, height = 40, label, unit }: {
    data: number[]; color: string; height?: number; label: string; unit: string;
}) {
    if (data.length < 2) {
        return (
            <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
                Waiting for data...
            </div>
        );
    }

    const max = Math.max(...data, 0.001);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const w = 260;
    const h = height;
    const padding = 2;
    const latest = data[data.length - 1];

    const points = data.map((v, i) => {
        const x = padding + (i / (data.length - 1)) * (w - 2 * padding);
        const y = h - padding - ((v - min) / range) * (h - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    // Area fill path
    const firstX = padding;
    const lastX = padding + ((data.length - 1) / (data.length - 1)) * (w - 2 * padding);
    const areaPath = `M${firstX},${h} L${points.split(' ').map(p => p).join(' L')} L${lastX},${h} Z`;

    return (
        <div className="px-3 py-2">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                <span className="text-xs font-mono font-semibold" style={{ color }}>{latest.toFixed(2)} {unit}</span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
                <defs>
                    <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill={`url(#grad-${label.replace(/\s/g, '')})`} />
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* Latest value dot */}
                <circle
                    cx={lastX}
                    cy={h - padding - ((latest - min) / range) * (h - 2 * padding)}
                    r="3"
                    fill={color}
                />
            </svg>
        </div>
    );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex justify-between items-center py-1.5 px-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-mono font-medium text-card-foreground">{value}</span>
        </div>
    );
}

export default function MetricsPanel({ networkStats, cryptoMetrics, cryptoStatus, peerCount, onClose }: MetricsPanelProps) {
    const [history, setHistory] = useState<TimePoint[]>([]);
    const MAX_POINTS = 60; // 60 seconds of data

    // Accumulate time-series data
    useEffect(() => {
        if (!networkStats || peerCount === 0) return;
        const now = Date.now();
        const label = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setHistory(prev => {
            const next = [...prev, {
                time: now, label,
                bitrate: networkStats.bitrateKbps,
                rtt: networkStats.rttMs,
                jitter: networkStats.jitterMs,
                packetLoss: networkStats.packetLossPercent,
                encTime: cryptoMetrics.encryptionTimeMs,
                decTime: cryptoMetrics.decryptionTimeMs,
            }];
            return next.slice(-MAX_POINTS);
        });
    }, [networkStats, cryptoMetrics, peerCount]);

    const hasData = peerCount > 0 && history.length > 0;

    return (
        <div className="w-96 bg-card border-l border-border flex flex-col h-full pb-20">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <span className="font-display font-semibold text-card-foreground">Live Metrics</span>
                    {hasData && (
                        <span className="flex items-center gap-1 text-[10px] text-meet-green">
                            <span className="w-1.5 h-1.5 rounded-full bg-meet-green animate-pulse" />
                            LIVE
                        </span>
                    )}
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {peerCount === 0 ? (
                    <div className="text-center text-muted-foreground text-sm mt-12">
                        <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No active connection</p>
                        <p className="text-xs mt-1">Metrics will appear when another participant joins</p>
                    </div>
                ) : (
                    <>
                        {/* ── Network Stats ── */}
                        <div>
                            <div className="flex items-center gap-2 mb-2 px-3">
                                <Wifi className="w-3.5 h-3.5 text-meet-teal" />
                                <span className="text-xs font-semibold text-card-foreground uppercase tracking-wider">Network</span>
                            </div>
                            <div className="bg-accent/30 rounded-xl divide-y divide-border/50">
                                <StatRow label="Bytes Sent" value={networkStats ? `${(networkStats.bytesSent / 1024).toFixed(1)} KB` : '—'} />
                                <StatRow label="Bytes Received" value={networkStats ? `${(networkStats.bytesReceived / 1024).toFixed(1)} KB` : '—'} />
                                <StatRow label="Packets Sent" value={networkStats?.packetsSent ?? '—'} />
                                <StatRow label="Packets Received" value={networkStats?.packetsReceived ?? '—'} />
                                <StatRow label="RTT" value={networkStats ? `${networkStats.rttMs} ms` : '—'} />
                                <StatRow label="Jitter" value={networkStats ? `${networkStats.jitterMs} ms` : '—'} />
                                <StatRow label="Packet Loss" value={networkStats ? `${networkStats.packetLossPercent}%` : '—'} />
                                <StatRow label="Bitrate" value={networkStats ? `${networkStats.bitrateKbps} kbps` : '—'} />
                            </div>
                        </div>

                        {/* ── Crypto Stats ── */}
                        <div>
                            <div className="flex items-center gap-2 mb-2 px-3">
                                <Shield className="w-3.5 h-3.5 text-meet-green" />
                                <span className="text-xs font-semibold text-card-foreground uppercase tracking-wider">Crypto</span>
                            </div>
                            <div className="bg-accent/30 rounded-xl divide-y divide-border/50">
                                <StatRow label="Status" value={cryptoStatus === 'encrypted' ? 'Kyber-512 Active' : cryptoStatus === 'exchanging' ? 'Exchanging...' : 'Not Encrypted'} />
                                <StatRow label="Key Exchange" value={`${cryptoMetrics.keyExchangeTimeMs} ms`} />
                                <StatRow label="Obfuscation Time" value={`${cryptoMetrics.encryptionTimeMs} ms`} />
                                <StatRow label="De-obfuscation Time" value={`${cryptoMetrics.decryptionTimeMs} ms`} />
                                <StatRow label="Avg Overhead" value={`${cryptoMetrics.avgOverheadMs} ms`} />
                            </div>
                        </div>

                        {/* ── Time-series Graphs ── */}
                        {hasData && (
                            <div>
                                <div className="flex items-center gap-2 mb-2 px-3">
                                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-xs font-semibold text-card-foreground uppercase tracking-wider">
                                        Over Time ({history.length}s)
                                    </span>
                                </div>
                                <div className="bg-accent/30 rounded-xl divide-y divide-border/50 overflow-hidden">
                                    <Sparkline
                                        data={history.map(h => h.bitrate)}
                                        color="#3b82f6"
                                        label="Bitrate"
                                        unit="kbps"
                                    />
                                    <Sparkline
                                        data={history.map(h => h.rtt)}
                                        color="#14b8a6"
                                        label="Round Trip Time"
                                        unit="ms"
                                    />
                                    <Sparkline
                                        data={history.map(h => h.jitter)}
                                        color="#f59e0b"
                                        label="Jitter"
                                        unit="ms"
                                    />
                                    <Sparkline
                                        data={history.map(h => h.packetLoss)}
                                        color="#ef4444"
                                        label="Packet Loss"
                                        unit="%"
                                    />
                                    <Sparkline
                                        data={history.map(h => h.encTime)}
                                        color="#8b5cf6"
                                        label="Obfuscation Time"
                                        unit="ms"
                                    />
                                    <Sparkline
                                        data={history.map(h => h.decTime)}
                                        color="#ec4899"
                                        label="De-obfuscation Time"
                                        unit="ms"
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
