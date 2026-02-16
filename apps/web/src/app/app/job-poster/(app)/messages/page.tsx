import { MessagesClient } from "../../../../../components/Messaging/MessagesClient";

export default function JobPosterMessagesPage() {
  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Messages</h2>
      <p className="text-gray-600 mt-2">Private chat between you and your contractor (job-bound, persists after completion).</p>
      <MessagesClient role="job-poster" />
    </>
  );
}

