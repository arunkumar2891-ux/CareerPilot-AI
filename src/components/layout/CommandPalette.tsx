import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command';
import { NAV_ITEMS } from '@/constants';
import { LayoutDashboard, Search, Settings } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (path: string) => void;
}

export function CommandPalette({ open, onOpenChange, onNavigate }: Props) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onNavigate(path);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, run actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => go('/jobs')}>
            <Search className="mr-2 h-4 w-4" />
            <span>Run Job Search</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/copilot')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Open AI Copilot</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/workflows')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Create Workflow</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.path} onSelect={() => go(item.path)}>
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
