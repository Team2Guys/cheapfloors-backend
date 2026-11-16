import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Public } from '../decorators/public.decorator';
import { WhatsAppClicksService } from './whatsapp-clicks.service';

@Resolver()
export class WhatsAppClicksResolver {
  constructor(private readonly whatsAppClicksService: WhatsAppClicksService) {}

  // Public: the storefront's /api/wa-click route calls it for every WhatsApp
  // button click. It only stores the source ref (see WA_REF), never anything
  // the visitor typed, and returns nothing back.
  @Public()
  @Mutation(() => Boolean, { name: 'logWhatsAppClick' })
  logWhatsAppClick(@Args('ref', { type: () => String }) ref: string) {
    return this.whatsAppClicksService.log(ref);
  }
}
