import { Hero } from '@/components/landing/hero';
import { FeatureCards } from '@/components/landing/feature-cards';
import { LoopDiagram } from '@/components/landing/loop-diagram';
import { LiveStats } from '@/components/landing/live-stats';
import { UserTypeCta } from '@/components/landing/user-type-cta';
import { OnboardingSteps } from '@/components/landing/onboarding-steps';
import { FeedPreview } from '@/components/landing/feed-preview';
import { DashboardTeaser } from '@/components/landing/dashboard-teaser';
import { Footer } from '@/components/landing/footer';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FeatureCards />
      <LoopDiagram />
      <LiveStats />
      <UserTypeCta />
      <OnboardingSteps />
      <FeedPreview />
      <DashboardTeaser />
      <Footer />
    </>
  );
}
