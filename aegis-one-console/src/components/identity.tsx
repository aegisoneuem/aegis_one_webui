import { House, Desktop, SquaresFour, UserPlus, ShieldCheck, Package, ArrowUpRight, Pulse, Warning, Heartbeat, ChartLineUp, Lightbulb, Globe, HardDrives, FileText, ClockCounterClockwise, PlugsConnected, Code, GearSix, Key, FirstAidKit, MagnifyingGlass, Bell, Question, SidebarSimple, CaretRight, CaretDown, ArrowsClockwise, Plus, ArrowRight, ArrowLeft, ArrowClockwise, DownloadSimple, FunnelSimple, CalendarBlank, Clock, Check, X, Info, DotsThree, ArrowDownRight, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import logo from '../logo';
const icons = {
  House,
  Desktop,
  SquaresFour,
  UserPlus,
  ShieldCheck,
  Package,
  ArrowUpRight,
  Pulse,
  Warning,
  Heartbeat,
  ChartLineUp,
  Lightbulb,
  Globe,
  HardDrives,
  FileText,
  ClockCounterClockwise,
  PlugsConnected,
  Code,
  GearSix,
  Key,
  FirstAidKit,
  MagnifyingGlass,
  Bell,
  Question,
  SidebarSimple,
  CaretRight,
  CaretDown,
  ArrowsClockwise,
  Plus,
  ArrowRight,
  ArrowLeft,
  ArrowClockwise,
  DownloadSimple,
  FunnelSimple,
  CalendarBlank,
  Clock,
  Check,
  X,
  Info,
  DotsThree,
  ArrowDownRight,
  ArrowUp,
  ArrowDown
};
export function PhosphorIcon({
  name,
  size = 18,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = icons[name as keyof typeof icons] || SquaresFour;
  return <Icon size={size} weight="bold" aria-hidden="true" {...props} />;
}
const navigation: Record<string, string> = {
  'Overview': 'House',
  'Devices': 'Desktop',
  'Device groups': 'SquaresFour',
  'Enrollment': 'UserPlus',
  'Patches': 'ShieldCheck',
  'Software': 'Package',
  'Deployments': 'ArrowUpRight',
  'Live operations': 'Pulse',
  'Vulnerabilities': 'Warning',
  'DEX': 'Heartbeat',
  'AEGIS Insight': 'Lightbulb',
  'Configuration profiles': 'GearSix',
  'Configuration': 'GearSix',
  "Aegis Zones": 'Globe',
  'Peer cache': 'HardDrives',
  'Reports': 'ChartLineUp',
  'Activity': 'ClockCounterClockwise',
  'Integrations': 'PlugsConnected',
  'API access': 'Code',
  'Administration': 'GearSix',
  'Licensing': 'Key',
  'Diagnostics': 'FirstAidKit'
};
export function NavIcon({
  label
}: {
  label: string;
}) {
  return <PhosphorIcon name={navigation[label] || Object.entries(navigation).find(([key]) => key.toLowerCase() === label.toLowerCase())?.[1] || 'SquaresFour'} size={18} />;
}
export function CompactBrand() {
  return <span className="compact-brand"><span className="compact-mark"><img src={logo} alt="" /></span><span className="compact-wordmark">AEGIS <b>ONE</b></span></span>;
}