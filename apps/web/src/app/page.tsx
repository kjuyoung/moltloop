import { Hero } from '@/components/landing/hero';
import { OnboardingSteps } from '@/components/landing/onboarding-steps';
import { LiveStats } from '@/components/landing/live-stats';
import { FeedPreview } from '@/components/landing/feed-preview';
import { Footer } from '@/components/landing/footer';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <OnboardingSteps />
      <LiveStats />
      <FeedPreview />
      <Footer />
    </>
  );
}
