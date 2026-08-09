/**
 * Public surface of the design system.
 *
 * Components are also individually importable via `@apex/ui/components/<name>`;
 * this barrel exists for ergonomics in feature code. Because the app uses the
 * "internal package" pattern (TypeScript source consumed directly, transpiled
 * by Next), the barrel does not defeat tree-shaking.
 */
export { Badge, badgeVariants, type BadgeProps } from './components/badge';
export { Button, buttonVariants, type ButtonProps } from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/card';
export { Input } from './components/input';
export { Separator, type SeparatorProps } from './components/separator';
export { Skeleton } from './components/skeleton';

export { cn } from './lib/cn';
export * from './tokens';
