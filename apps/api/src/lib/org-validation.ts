import { prisma } from "./prisma.js";

export async function validateAssigneesInOrg(
  organizationId: string,
  userIds: string[],
): Promise<boolean> {
  if (userIds.length === 0) return true;
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true },
  });
  return members.length === userIds.length;
}

export async function validateRecurringMeetingsInOrg(
  organizationId: string,
  recurringMeetingIds: string[],
): Promise<boolean> {
  if (recurringMeetingIds.length === 0) return true;
  const rms = await prisma.recurringMeeting.findMany({
    where: { id: { in: recurringMeetingIds }, organizationId },
    select: { id: true },
  });
  return rms.length === recurringMeetingIds.length;
}
