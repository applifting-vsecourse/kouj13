import { Poll } from '@/modules/poll/domain/poll';
import { PollRepository } from '@/modules/poll/repositories/poll.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PollsService {
  constructor(private readonly repository: PollRepository) {}
  vote(user: Identity, pollId: string, optionId: string): Promise<Poll> {
    return this.repository.vote(pollId, user.id, optionId);
  }
}
