import React from "react";
import styled, { keyframes } from "styled-components";

const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const SkeletonBase = styled.div`
  background: linear-gradient(
    90deg,
    var(--veterinary-glass-bg) 25%,
    var(--veterinary-card-bg, rgba(255,255,255,0.9)) 50%,
    var(--veterinary-glass-bg) 75%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.5s infinite;
  border-radius: var(--veterinary-radius-md, 12px);

`;

const StatCardSkeleton = styled.div`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: var(--veterinary-radius-xl, 20px);
  padding: 24px;
  backdrop-filter: blur(20px);
  box-shadow: var(--veterinary-glass-shadow);
  display: flex;
  align-items: center;
  gap: 16px;
`;

const IconSkeleton = styled(SkeletonBase)`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  flex-shrink: 0;
`;

const ContentSkeleton = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TitleSkeleton = styled(SkeletonBase)`
  height: 14px;
  width: 60%;
`;

const ValueSkeleton = styled(SkeletonBase)`
  height: 32px;
  width: 40%;
`;

const SubtitleSkeleton = styled(SkeletonBase)`
  height: 12px;
  width: 80%;
`;

const CardSkeleton = styled.div`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: var(--veterinary-radius-2xl, 24px);
  overflow: hidden;
  backdrop-filter: blur(20px);
  box-shadow: var(--veterinary-glass-shadow);
`;

const CardHeaderSkeleton = styled(SkeletonBase)`
  height: 72px;
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  border-radius: 0;
`;

const CardContentSkeleton = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const RowSkeleton = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--veterinary-radius-lg, 16px);
  background: rgba(255, 255, 255, 0.5);
  border: 2px solid var(--veterinary-glass-border);
`;

const RowIconSkeleton = styled(SkeletonBase)`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  flex-shrink: 0;
`;

const RowContentSkeleton = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const RowTitleSkeleton = styled(SkeletonBase)`
  height: 16px;
  width: 70%;
`;

const RowSubtitleSkeleton = styled(SkeletonBase)`
  height: 12px;
  width: 50%;
`;

const HeroSkeleton = styled.div`
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  border-radius: var(--veterinary-radius-2xl, 24px);
  padding: 40px;
  margin-bottom: 32px;
  height: 200px;
`;

/**
 * VetStatCardSkeleton - Skeleton for stat cards in the dashboard
 */
export const VetStatCardSkeleton = () => (
  <StatCardSkeleton>
    <IconSkeleton />
    <ContentSkeleton>
      <TitleSkeleton />
      <ValueSkeleton />
      <SubtitleSkeleton />
    </ContentSkeleton>
  </StatCardSkeleton>
);

/**
 * VetCardSkeleton - Skeleton for cards with header and content
 */
export const VetCardSkeleton = ({ rows = 3 }) => (
  <CardSkeleton>
    <CardHeaderSkeleton />
    <CardContentSkeleton>
      {Array.from({ length: rows }).map((_, index) => (
        <RowSkeleton key={index}>
          <RowIconSkeleton />
          <RowContentSkeleton>
            <RowTitleSkeleton />
            <RowSubtitleSkeleton />
          </RowContentSkeleton>
        </RowSkeleton>
      ))}
    </CardContentSkeleton>
  </CardSkeleton>
);

/**
 * VetHeroSkeleton - Skeleton for hero section
 */
export const VetHeroSkeleton = () => <HeroSkeleton />;

/**
 * VetDashboardSkeleton - Full dashboard skeleton layout
 */
export const VetDashboardSkeleton = () => (
  <div style={{ padding: "32px" }}>
    <HeroSkeleton />
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "24px",
        marginBottom: "32px",
      }}
    >
      <VetStatCardSkeleton />
      <VetStatCardSkeleton />
      <VetStatCardSkeleton />
      <VetStatCardSkeleton />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
      <VetCardSkeleton rows={3} />
      <VetCardSkeleton rows={4} />
    </div>
  </div>
);

/**
 * VetAppointmentCardSkeleton - Skeleton for appointment cards
 */
export const VetAppointmentCardSkeleton = () => (
  <CardSkeleton style={{ minHeight: "300px" }}>
    <CardHeaderSkeleton />
    <CardContentSkeleton>
      {Array.from({ length: 4 }).map((_, index) => (
        <RowSkeleton key={index}>
          <RowIconSkeleton />
          <RowContentSkeleton>
            <RowTitleSkeleton />
            <RowSubtitleSkeleton />
          </RowContentSkeleton>
        </RowSkeleton>
      ))}
    </CardContentSkeleton>
  </CardSkeleton>
);

/**
 * VetGridSkeleton - Grid of skeleton cards
 */
export const VetGridSkeleton = ({ count = 6 }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
      gap: "24px",
    }}
  >
    {Array.from({ length: count }).map((_, index) => (
      <VetAppointmentCardSkeleton key={index} />
    ))}
  </div>
);

export default {
  VetStatCardSkeleton,
  VetCardSkeleton,
  VetHeroSkeleton,
  VetDashboardSkeleton,
  VetAppointmentCardSkeleton,
  VetGridSkeleton,
};
