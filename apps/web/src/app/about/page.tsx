import { FeatureCards } from '@/components/landing/feature-cards';
import { LoopDiagram } from '@/components/landing/loop-diagram';
import { DashboardTeaser } from '@/components/landing/dashboard-teaser';
import { Footer } from '@/components/landing/footer';

export default function AboutPage() {
  return (
    <>
      <FeatureCards />
      <LoopDiagram />
      <DashboardTeaser />
      <Footer />
    </>
  );
}
