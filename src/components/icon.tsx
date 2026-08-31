import {
  ArrowUpRight,
  BookOpen,
  Bus,
  Car,
  LineChart,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  ExternalLink,
  FileText,
  Clapperboard,
  Heart,
  Home,
  Image,
  Lock,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Shapes,
  Shirt,
  Smartphone,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  Upload,
  User,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "arrow-up-right"
  | "book"
  | "bus"
  | "car"
  | "chart"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "download"
  | "edit"
  | "external"
  | "file"
  | "film"
  | "heart"
  | "home"
  | "image"
  | "lock"
  | "logout"
  | "menu"
  | "plus"
  | "refresh"
  | "rose"
  | "settings"
  | "shapes"
  | "shirt"
  | "smartphone"
  | "spark"
  | "tag"
  | "ticket"
  | "trash"
  | "upload"
  | "user"
  | "users"
  | "utensils"
  | "x";

const iconMap: Record<IconName, LucideIcon> = {
  "arrow-up-right": ArrowUpRight,
  book: BookOpen,
  bus: Bus,
  car: Car,
  chart: LineChart,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  download: Download,
  edit: Edit2,
  external: ExternalLink,
  file: FileText,
  film: Clapperboard,
  heart: Heart,
  home: Home,
  image: Image,
  lock: Lock,
  logout: LogOut,
  menu: Menu,
  plus: Plus,
  refresh: RefreshCw,
  rose: Heart,
  settings: Settings,
  shapes: Shapes,
  shirt: Shirt,
  smartphone: Smartphone,
  spark: Sparkles,
  tag: Tag,
  ticket: Ticket,
  trash: Trash2,
  upload: Upload,
  user: User,
  users: Users,
  utensils: Utensils,
  x: X,
};

export function getCategoryIconName(name: string): IconName {
  const lower = name.toLowerCase().trim();
  if (lower === "food" || lower === "dining" || lower === "groceries" || lower === "coffee") return "utensils";
  if (lower === "entertainment" || lower === "movies" || lower === "games") return "film";
  if (lower === "income" || lower === "salary" || lower === "payroll" || lower === "deposit" || lower === "wage" || lower === "stipend") return "arrow-up-right";
  if (lower === "personal" || lower === "personal care" || lower === "health") return "user";
  if (lower === "driving" || lower === "gas" || lower === "auto" || lower === "parking") return "car";
  if (lower === "housing" || lower === "home" || lower === "rent" || lower === "mortgage") return "home";
  if (lower === "education" || lower === "school" || lower === "courses" || lower === "books" || lower === "tuition" || lower === "learning") return "book";
  if (lower === "transport" || lower === "transportation" || lower === "transit" || lower === "metro" || lower === "bus" || lower === "train" || lower === "travel") return "bus";
  if (lower === "clothing" || lower === "shopping" || lower === "apparel") return "shirt";
  if (lower === "misc" || lower === "miscellaneous" || lower === "other") return "shapes";
  return "tag";
}

export function Icon({ name, className = "icon", label }: { name: IconName; className?: string; label?: string }) {
  const Component = iconMap[name] ?? Tag;
  return <Component className={className} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} />;
}
