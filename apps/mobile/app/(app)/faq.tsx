import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Colors } from "../../components/ui";
import { BackButton } from "../../components/BackButton";

function FaqCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "900" }}>
        {title}
      </Text>
      <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 }}>
        {body}
      </Text>
    </Card>
  );
}

export default function FaqScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={{ padding: 20 }}>
        <BackButton fallbackHref="/jobs" />

        <Text style={{ color: Colors.text, fontSize: 24, fontWeight: "900", marginTop: 10 }}>
          Trust & FAQ
        </Text>
        <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 14 }}>
          Clear, calm, and human-controlled. This is not a gig marketplace.
        </Text>

        <FaqCard
          title="What is 8Fold Local?"
          body="A managed routing platform. You can claim an approved service job and confirm routing. Admins assign and close out jobs with vetted contractors."
        />
        <FaqCard
          title="How do I earn?"
          body="Each job shows your coordination fee upfront. You earn it when an admin marks the job completed. There is no guaranteed income."
        />
        <FaqCard
          title="Who does the work?"
          body="Contractors complete the work. In v1, contractors do not use an app. Users never see contractor or customer identities."
        />
        <FaqCard
          title="Why is everything manual?"
          body="For compliance and auditability. Money movement, approvals, and final decisions are human-controlled in v1."
        />
        <FaqCard
          title="When do payouts happen?"
          body="You request a withdrawal from your available balance. Payouts are processed manually (v1)."
        />
        <FaqCard
          title="Can I claim multiple jobs?"
          body="No. In v1, you can have only one active job at a time to keep the system stable and auditable."
        />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

