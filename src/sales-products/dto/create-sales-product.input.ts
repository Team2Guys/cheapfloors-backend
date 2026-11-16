import {
  InputType,
  Int,
  Field,
  Float,
  PartialType,
  registerEnumType,
} from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

export enum OrderStatus {
  placed = 'placed',
  shipped = 'shipped',
  delivered = 'delivered',
  cancel = 'cancel',
}

registerEnumType(OrderStatus, {
  name: 'OrderStatus',
  description: 'Status of the order (placed, shipped, delivered, cancel)',
});

// Where the customer came from, as the storefront's cf_src cookie recorded it
// (see order-source.ts). Every field is optional and cleaned on arrival.
@InputType()
export class OrderSourceInput {
  @Field({ nullable: true })
  channel?: string;

  @Field({ nullable: true })
  sourceTracked?: string;

  @Field({ nullable: true })
  firstTouchChannel?: string;

  @Field({ nullable: true })
  firstTouchDetail?: string;

  @Field({ nullable: true })
  lastTouchChannel?: string;

  @Field({ nullable: true })
  lastTouchDetail?: string;

  @Field({ nullable: true })
  firstVisit?: string;

  @Field({ nullable: true })
  landingPage?: string;

  @Field({ nullable: true })
  referrer?: string;

  @Field({ nullable: true })
  gclid?: string;

  @Field({ nullable: true })
  fbclid?: string;

  /** JSON array of touches, oldest first. */
  @Field({ nullable: true })
  touchPath?: string;
}

@InputType()
export class CreateOrderInput {
  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  email: string;

  @Field()
  country: string;

  @Field()
  city: string;

  @Field()
  address: string;

  @Field()
  note: string;

  @Field()
  phone: string;

  @Field()
  emirate: string;

  @Field({ nullable: true })
  otherCity?: string;

  @Field(() => [GraphQLJSON])
  products: any[];

  @Field(() => Float)
  shipmentFee: number;

  @Field(() => Float)
  totalPrice: number;

  @Field(() => GraphQLJSON)
  shippingMethod: any;

  @Field(() => OrderStatus, { nullable: true })
  orderStatus?: OrderStatus;

  @Field(() => Date, { nullable: true })
  deliveryDate: Date;

  // Not a column: the service turns it into the order's source columns.
  @Field(() => OrderSourceInput, { nullable: true })
  source?: OrderSourceInput;
}

// Input DTO for the Product (used within CreateOrderInput)
@InputType()
export class ProductInput {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field(() => Float)
  price: number;

  @Field(() => Float)
  stock: number;

  @Field()
  image: string;

  @Field()
  subcategories: string;

  @Field()
  category: string;

  @Field()
  boxCoverage: string;

  @Field(() => Float)
  totalPrice: number;

  @Field(() => Float)
  pricePerBox: number;

  @Field()
  squareMeter: string;

  @Field(() => Int)
  requiredBoxes: number;
}

@InputType()
export class contactUsEmailInput {
  @Field()
  firstName: string;
  @Field()
  LastName: string;
  @Field()
  email: string;
  @Field()
  phoneNumber: string;
  @Field()
  message: string;
}

@InputType()
export class PaymentQueryDto {
  @Field(() => Boolean, { nullable: true })
  success?: boolean;

  @Field({ nullable: true })
  integrationId?: string;

  @Field({ nullable: true })
  orderId?: string;

  @Field(() => Boolean, { nullable: true })
  pending?: boolean;

  @Field({ nullable: true })
  is3DSecure?: string;

  @Field({ nullable: true })
  pay_methodType?: string;

  @Field({ nullable: true })
  cardLastDigits?: string;

  @Field({ nullable: true })
  paymethod_sub_type?: string;

  @Field({ nullable: true })
  transactionId?: string;

  @Field({ nullable: true })
  amount?: string;

  // CCAvenue's order_status (Success, Failure, Aborted...). Set by the
  // callback controller; the public mutation ignores everything but orderId.
  @Field({ nullable: true })
  gatewayStatus?: string;
}

@InputType()
export class orderEmailInput extends PartialType(CreateOrderInput) {
  @Field()
  orderId: string;

  @Field()
  transactionDate: Date;
  @Field(() => Boolean, { nullable: true })
  isfreesample?: boolean;
}
