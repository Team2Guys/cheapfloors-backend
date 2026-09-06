import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { CCAvenueService } from './ccavenue.service';
import { SalesProductsService } from './sales-products.service';

@Controller('ccavenue')
export class CCAvenueController {
  constructor(
    private readonly ccavenue: CCAvenueService,
    private readonly salesProductsService: SalesProductsService,
  ) {}

  @Public()
  @Post('callback')
  async callback(@Body('encResp') encResp: string, @Res() res: Response) {
    const clientBaseUrl = process.env.CLIENT_URL_1 || 'https://cheapfloors.ae';

    if (!encResp) {
      return res.redirect(302, `${clientBaseUrl}/thank-you?success=false`);
    }

    let params: Record<string, string>;
    try {
      const decrypted = this.ccavenue.decrypt(encResp);
      params = this.ccavenue.parseResponseParams(decrypted);
    } catch (error) {
      console.log(error, 'ccavenue decrypt error');
      return res.redirect(302, `${clientBaseUrl}/thank-you?success=false`);
    }

    const success = params.order_status === 'Success';

    if (params.order_id) {
      try {
        await this.salesProductsService.postpaymentStatus({
          orderId: params.order_id,
          success,
          integrationId: params.bank_ref_no,
          transactionId: params.tracking_id,
          pay_methodType: params.payment_mode,
          paymethod_sub_type: params.card_name,
        });
      } catch (error) {
        console.log(error, 'ccavenue postpaymentStatus error');
      }
    }

    const redirectParams = new URLSearchParams({
      success: String(success),
      order: params.order_id || '',
    });

    return res.redirect(
      302,
      `${clientBaseUrl}/thank-you?${redirectParams.toString()}`,
    );
  }
}
