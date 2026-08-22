import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plus, Play, Pause, Trash2, ZoomIn, ZoomOut, Maximize2,
  Save, Settings, Zap, Workflow as WorkflowIcon, GitBranch,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { services } from '@/services';
import { EmptyState } from '@/components/shared/EmptyState';
import { NODE_CATEGORIES } from '@/constants';
import { uid, timeAgo } from '@/utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Workflow, WorkflowNode, WorkflowNodeType } from '@/types';

const NODE_COLORS: Record<string, string> = {
  schedule: 'bg-chart-4', webhook: 'bg-chart-4', trigger: 'bg-chart-4',
  gemini: 'bg-primary', openai: 'bg-success', claude: 'bg-chart-5', resume_optimizer: 'bg-primary', cover_letter: 'bg-primary', prompt: 'bg-primary',
  http: 'bg-chart-2', gdrive: 'bg-chart-2', gdocs: 'bg-chart-2', apify: 'bg-chart-2', linkedin: 'bg-chart-2', supabase: 'bg-chart-2', email: 'bg-chart-2', notification: 'bg-chart-2', storage: 'bg-chart-2', pdf: 'bg-chart-2',
  condition: 'bg-warning', loop: 'bg-warning', switch: 'bg-warning', merge: 'bg-warning', wait: 'bg-warning',
  job_search: 'bg-chart-1', duplicate_checker: 'bg-chart-1', function: 'bg-chart-1', transform: 'bg-chart-1',
};

export function WorkflowsPage() {
  const qc = useQueryClient();
  const { data: workflows } = useQuery({ queryKey: ['workflows'], queryFn: () => services.workflow.list() });
  const [selected, setSelected] = useState<Workflow | null>(null);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Workflow Studio"
        description="Built-in job search pipeline + custom workflows — drag, connect, automate"
        actions={
          <Button onClick={async () => {
            const wf = await services.workflow.create('New Workflow', 'Describe your automation');
            qc.invalidateQueries({ queryKey: ['workflows'] });
            setSelected(wf);
            toast.success('Workflow created');
          }} className="gap-2"><Plus className="h-4 w-4" /> New Workflow</Button>
        }
      />

      {(!workflows || workflows.length === 0) ? (
        <Card><CardContent><EmptyState icon={WorkflowIcon} title="Setting up your pipeline" description="Your built-in job search workflow (LinkedIn scrape → ATS optimize → PDF → email) is being provisioned. Refresh in a moment, or create a custom workflow." action={<Button onClick={async () => { const wf = await services.workflow.create('New Workflow', 'Describe your automation'); qc.invalidateQueries({ queryKey: ['workflows'] }); setSelected(wf); toast.success('Workflow created'); }} className="gap-2"><Plus className="h-4 w-4" /> New Workflow</Button>} /></CardContent></Card>
      ) : (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map((wf, i) => (
          <motion.div key={wf.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(wf)}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <WorkflowIcon className="h-5 w-5 text-primary" />
                  </div>
                  <StatusBadge status={wf.active ? 'active' : 'paused'} />
                </div>
                <p className="mt-3 font-semibold">{wf.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{wf.description}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{wf.nodes.length} nodes</span>
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{wf.runs.length} runs</span>
                  {wf.lastRun && <span>{timeAgo(wf.lastRun)}</span>}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      )}

      {selected && <WorkflowEditor workflow={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function WorkflowEditor({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const qc = useQueryClient();
  const [nodes, setNodes] = useState<WorkflowNode[]>(workflow.nodes);
  const [edges, setEdges] = useState(workflow.edges);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setNodes((n) => n.map((node) => (node.id === id ? { ...node, position: { x, y } } : node)));
  }, []);

  const addNode = (type: WorkflowNodeType) => {
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(), type, name: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 }, config: {},
    };
    setNodes((n) => [...n, newNode]);
    toast.success(`Added ${type} node`);
  };

  const removeNode = (id: string) => {
    setNodes((n) => n.filter((node) => node.id !== id));
    setEdges((e) => e.filter((edge) => edge.source !== id && edge.target !== id));
  };

  const startConnect = (id: string) => setConnecting(id);
  const finishConnect = (id: string) => {
    if (connecting && connecting !== id) {
      setEdges((e) => [...e, { id: crypto.randomUUID(), source: connecting, target: id }]);
    }
    setConnecting(null);
  };

  const run = async () => {
    try {
      toast.success('Running workflow...');
      await services.workflow.saveGraph(workflow.id, nodes, edges);
      const result = await services.execution.runWorkflow(workflow.id);
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      toast.success(`Workflow ${result.status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Workflow failed');
    }
  };

  const save = async () => {
    await services.workflow.saveGraph(workflow.id, nodes, edges);
    toast.success('Workflow saved');
    qc.invalidateQueries({ queryKey: ['workflows'] });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    updateNodePosition(dragging, x - 80, y - 30);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="h-[90vh] max-w-6xl overflow-hidden p-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <WorkflowIcon className="h-4 w-4 text-primary" /> {workflow.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={run} className="gap-1.5"><Play className="h-3.5 w-3.5" /> Run</Button>
              <Button variant="outline" size="sm" onClick={save} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPalette(!showPalette)} className="gap-1.5"><Settings className="h-3.5 w-3.5" /></Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {showPalette && (
              <div className="w-56 shrink-0 overflow-y-auto scrollbar-thin border-r border-border bg-card/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node Palette</p>
                {NODE_CATEGORIES.map((cat) => (
                  <div key={cat.name} className="mb-3">
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground">{cat.name}</p>
                    <div className="space-y-1">
                      {cat.nodes.map((n) => (
                        <button
                          key={n}
                          onClick={() => addNode(n as WorkflowNodeType)}
                          className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
                        >
                          <span className={cn('h-2 w-2 rounded-full', NODE_COLORS[n] || 'bg-muted')} />
                          <span className="capitalize">{n.replace(/_/g, ' ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="relative flex-1 overflow-hidden bg-muted/20 grid-bg">
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><ZoomIn className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}><ZoomOut className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize2 className="h-3.5 w-3.5" /></Button>
              </div>

              <div
                ref={canvasRef}
                className="absolute inset-0 cursor-grab"
                onMouseMove={handleMouseMove}
                onMouseUp={() => setDragging(null)}
                onMouseLeave={() => setDragging(null)}
              >
                <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }} className="relative h-full w-full">
                  <svg className="pointer-events-none absolute inset-0 h-full w-full">
                    {edges.map((edge) => {
                      const source = nodes.find((n) => n.id === edge.source);
                      const target = nodes.find((n) => n.id === edge.target);
                      if (!source || !target) return null;
                      const x1 = source.position.x + 160, y1 = source.position.y + 30;
                      const x2 = target.position.x, y2 = target.position.y + 30;
                      const mx = (x1 + x2) / 2;
                      return (
                        <path
                          key={edge.id}
                          d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="hsl(var(--border))"
                          strokeWidth={2}
                          className="pointer-events-none"
                        />
                      );
                    })}
                  </svg>

                  {nodes.map((node) => (
                    <div
                      key={node.id}
                      className={cn(
                        'absolute flex w-40 cursor-grab flex-col rounded-lg border bg-card shadow-md transition-shadow hover:shadow-lg',
                        connecting === node.id && 'ring-2 ring-primary',
                        dragging === node.id && 'cursor-grabbing shadow-xl'
                      )}
                      style={{ left: node.position.x, top: node.position.y }}
                      onMouseDown={() => setDragging(node.id)}
                      onMouseUp={() => finishConnect(node.id)}
                    >
                      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                        <span className={cn('h-2 w-2 rounded-full', NODE_COLORS[node.type] || 'bg-muted')} />
                        <span className="flex-1 truncate text-xs font-medium">{node.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeNode(node.id); }} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
                        <span className="capitalize">{node.type.replace(/_/g, ' ')}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); startConnect(node.id); }}
                          className="h-3 w-3 rounded-full border border-border hover:bg-primary"
                        />
                      </div>
                    </div>
                  ))}

                  {nodes.length === 0 && (
                    <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                      <div>
                        <WorkflowIcon className="mx-auto h-12 w-12 opacity-30" />
                        <p className="mt-2">Add nodes from the palette to start building</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-56 shrink-0 overflow-y-auto scrollbar-thin border-l border-border bg-card/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution History</p>
              <div className="space-y-2">
                {workflow.runs.slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded-lg border border-border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={run.status} />
                      <span className="text-muted-foreground">{(run.duration / 1000).toFixed(1)}s</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{timeAgo(run.startedAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
