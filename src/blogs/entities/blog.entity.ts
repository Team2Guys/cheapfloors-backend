import { ObjectType, Field, ID } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { BlogStatus } from '../../general/dto/enums/enum';

@ObjectType()
export class Blog {
  @Field(() => ID, { nullable: true })
  id?: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field({ nullable: true })
  category?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  posterImageUrl: any;

  @Field({ nullable: true })
  Images_Alt_Text?: string;

  @Field({ nullable: true })
  Meta_Title?: string;

  @Field({ nullable: true })
  Meta_Description?: string;

  @Field({ nullable: true })
  Canonical_Tag?: string;

  @Field()
  custom_url: string;

  @Field({ nullable: true })
  last_editedBy?: string;

  @Field(() => Date, { nullable: true })
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  updatedAt: Date;

  @Field(() => BlogStatus, { nullable: true })
  status?: BlogStatus;
}
