"use client";
import { ControlRoom } from "@/components/control";
import { PageHeader, TwMark } from "@/components/ui";

export default function ControlPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Control Room"
        subtitle={<>Change Orbit&apos;s production data live. CallBrain never tells Triggerware what happened: <TwMark className="text-sm" /> triggers notice the change on their own, push the rows back, and the timeline shows how long detection took.</>}
      />
      <ControlRoom />
    </div>
  );
}
