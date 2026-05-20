import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ example: 'user', enum: ['user', 'model'] })
  @IsString()
  @IsNotEmpty()
  role!: 'user' | 'model';

  @ApiProperty({ example: 'Comment puis-je économiser sur les transports ?' })
  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class ChatDto {
  @ApiProperty({ example: 'Combien ai-je dépensé en nourriture ce mois-ci ?' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ type: [ChatMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
